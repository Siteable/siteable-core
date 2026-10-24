/**
 * The bulk image pick engine turns the list a host-supplied picker returns into
 * exactly one outcome: append card rows in one undo step, do nothing, show one
 * error, or drop a stale result with one notice. It never fetches or stores the URLs.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { toast } from 'sonner'
import { useConfigStore } from '../src/store/configStore'
import type { SiteConfig } from '../src/blocks/types'
import { createImagePickRegistry } from '../src/editor/image-pick/image-pick-registry'
import { captureRowTarget, fieldLockKey } from '../src/editor/image-pick/image-pick-target'
import {
  runImagePick,
  IMAGE_PICK_FAILED_MESSAGE,
  IMAGE_PICK_DISCARDED_MESSAGE,
} from '../src/editor/image-pick/run-image-pick'
import {
  runBulkImagePick,
  bulkLockKey,
  captureBulkTarget,
} from '../src/editor/image-pick/run-bulk-image-pick'
import { appendPickedItems } from '../src/editor/card-grid-items-editor/card-grid-items-ops'

type Item = Record<string, unknown>
const makeItems = (): Item[] => [
  { title: 'One', image: 'one.png', alt: 'one', category: 'a' },
  { title: 'Two', image: 'two.png', alt: 'two', category: 'b' },
  { title: 'Three', image: 'three.png', alt: 'three', category: 'a' },
]

function seedConfig(): SiteConfig {
  const home = [
    { id: 'hero-1', type: 'hero', variant: 'default', props: { title: 'T', other: 'x' } },
    { id: 'cg-1', type: 'card-grid', variant: 'default', props: { items: makeItems() } },
    { id: 'cg-2', type: 'card-grid', variant: 'default', props: { items: [{ title: 'Solo', image: 's.png' }] } },
    { id: 'gallery-1', type: 'gallery', variant: 'default', props: { images: [{ src: 'a.png', alt: 'a' }] } },
  ]
  const second = [{ id: 'hero-2', type: 'hero', variant: 'default', props: { heroImage: 'two.png' } }]
  return {
    name: 'Test',
    pages: [
      { id: 'page-home', name: 'Home', path: '/', blocks: home },
      { id: 'page-two', name: 'Two', path: '/two', blocks: second },
    ],
    blocks: home,
  } as unknown as SiteConfig
}

const store = () => useConfigStore.getState()
const homeBlock = (id: string) => store().config.pages![0].blocks.find((b) => b.id === id)!
const items = (id = 'cg-1') => homeBlock(id).props.items as Item[]
const toastCount = () => toast.getHistory().length
const alive = () => true

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const entries = (n: number, prefix = 'https://cdn.example/') =>
  Array.from({ length: n }, (_, i) => ({ url: `${prefix}${i}.png`, name: `Name ${i}` }))
const target = (blockId = 'cg-1') => captureBulkTarget(blockId, 'items')
const keyOf = (t: ReturnType<typeof target>) => bulkLockKey(t.generation, t.pageId, t.blockId, t.listKey)
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

beforeEach(() => {
  store().setConfig(seedConfig())
})

describe('outcomes', () => {
  it.each([
    ['null', () => null],
    ['an empty list', () => []],
    ['a promise of null', () => Promise.resolve(null)],
  ])('treats %s as a silent dismissal', async (_name, hook) => {
    const before = store().config
    const undo = store().undoStack.length
    const t = toastCount()
    const registry = createImagePickRegistry()
    const tg = target()
    expect(await runBulkImagePick(hook as never, registry, tg, alive)).toBe('dismissed')
    expect(store().config).toBe(before)
    expect(store().undoStack.length).toBe(undo)
    expect(toastCount()).toBe(t)
    expect(registry.has(keyOf(tg))).toBe(false)
  })

  it.each([
    ['a rejection', () => Promise.reject(new Error('boom'))],
    ['a synchronous throw', () => { throw new Error('boom') }],
    ['a string', () => 'x'],
    ['a plain object', () => ({})],
    ['a number', () => 1],
    ['undefined', () => undefined],
    ['more than 100 entries', () => entries(101)],
    ['a list with no valid entry', () => [{ url: '' }, { url: 3 }, null, 'x']],
  ])('fails with one error toast on %s', async (_name, hook) => {
    const before = store().config
    const undo = store().undoStack.length
    const t = toastCount()
    const registry = createImagePickRegistry()
    const tg = target()
    expect(await runBulkImagePick(hook as never, registry, tg, alive)).toBe('failed')
    expect(store().config).toBe(before)
    expect(store().undoStack.length).toBe(undo)
    expect(toastCount()).toBe(t + 1)
    expect(toast.getHistory().at(-1)).toMatchObject({ title: IMAGE_PICK_FAILED_MESSAGE })
    expect(registry.has(keyOf(tg))).toBe(false)
  })

  it('appends 100 valid entries', async () => {
    const t = toastCount()
    expect(await runBulkImagePick(() => entries(100), createImagePickRegistry(), target(), alive)).toBe('written')
    expect(items()).toHaveLength(103)
    expect(items()[102]).toMatchObject({ image: 'https://cdn.example/99.png', name: 'Name 99' })
    expect(toastCount()).toBe(t)
  })

  it('accepts a synchronous array return', async () => {
    expect(await runBulkImagePick(() => entries(2), createImagePickRegistry(), target(), alive)).toBe('written')
    expect(items()).toHaveLength(5)
  })

  it('skips invalid entries and keeps the valid ones', async () => {
    const hook = () => [{ url: '  a.png  ', name: ' A ' }, { url: '' }, null, { url: 'b.png' }]
    expect(await runBulkImagePick(hook as never, createImagePickRegistry(), target(), alive)).toBe('written')
    expect(items().slice(3)).toMatchObject([
      { image: 'a.png', name: 'A' },
      { image: 'b.png' },
    ])
  })
})

describe('throws past the hook', () => {
  it('fails with one toast and frees the lock when an entry url getter throws', async () => {
    const registry = createImagePickRegistry()
    const tg = target()
    const before = store().config
    const t = toastCount()
    const hook = () => [{ get url(): string { throw new Error('x') } }]
    expect(await runBulkImagePick(hook as never, registry, tg, alive)).toBe('failed')
    expect(toastCount()).toBe(t + 1)
    expect(toast.getHistory().at(-1)).toMatchObject({ title: IMAGE_PICK_FAILED_MESSAGE })
    expect(store().config).toBe(before)
    expect(registry.has(keyOf(tg))).toBe(false)
  })

  it('fails with one toast and frees the lock when the store write throws', async () => {
    const registry = createImagePickRegistry()
    const tg = target()
    const original = store().updateBlockProps
    useConfigStore.setState({
      updateBlockProps: () => {
        throw new Error('quota')
      },
    })
    try {
      const t = toastCount()
      expect(await runBulkImagePick(() => entries(2), registry, tg, alive)).toBe('failed')
      expect(toastCount()).toBe(t + 1)
      expect(toast.getHistory().at(-1)).toMatchObject({ title: IMAGE_PICK_FAILED_MESSAGE })
      expect(registry.has(keyOf(tg))).toBe(false)
    } finally {
      useConfigStore.setState({ updateBlockProps: original })
    }
  })
})

describe('lock', () => {
  it('uses a bulk prefix and differs from the field key of the same parts', () => {
    const tg = target()
    const key = keyOf(tg)
    expect(key.startsWith('bulk:')).toBe(true)
    expect(key).not.toBe(fieldLockKey(tg.generation, tg.pageId, tg.blockId, tg.listKey))
  })

  it('keeps ids containing a colon apart', async () => {
    expect(bulkLockKey(1, 'a:b', 'c', 'items')).not.toBe(bulkLockKey(1, 'a', 'b:c', 'items'))
    const registry = createImagePickRegistry()
    const g = store().configGeneration
    const first = deferred<null>()
    const second = deferred<null>()
    let calls = 0
    const runA = runBulkImagePick(
      () => { calls++; return first.promise },
      registry,
      { generation: g, pageId: 'a:b', blockId: 'c', listKey: 'items' },
      alive,
    )
    const runB = runBulkImagePick(
      () => { calls++; return second.promise },
      registry,
      { generation: g, pageId: 'a', blockId: 'b:c', listKey: 'items' },
      alive,
    )
    expect(calls).toBe(2)
    first.resolve(null)
    second.resolve(null)
    expect(await runA).toBe('dismissed')
    expect(await runB).toBe('dismissed')
  })

  it('refuses a second run on a pending target without calling the host', async () => {
    const registry = createImagePickRegistry()
    const d = deferred<null>()
    let calls = 0
    const run = runBulkImagePick(() => { calls++; return d.promise }, registry, target(), alive)
    const t = toastCount()
    expect(await runBulkImagePick(() => { calls++; return null }, registry, target(), alive)).toBe('refused')
    expect(calls).toBe(1)
    expect(toastCount()).toBe(t)
    d.resolve(null)
    expect(await run).toBe('dismissed')
    expect(await runBulkImagePick(() => entries(1), registry, target(), alive)).toBe('written')
  })

  it('lets another block, a field pick and a row pick proceed while a bulk pick is pending', async () => {
    const registry = createImagePickRegistry()
    const d = deferred<null>()
    const run = runBulkImagePick(() => d.promise, registry, target('cg-1'), alive)
    expect(await runBulkImagePick(() => entries(1), registry, target('cg-2'), alive)).toBe('written')
    const fieldTarget = { kind: 'field', generation: store().configGeneration, pageId: store().activePageId, blockId: 'hero-1', fieldKey: 'heroImage' } as const
    expect(await runImagePick(() => 'hero.png', registry, fieldTarget as never)).toBe('written')
    const rowTarget = captureRowTarget('cg-1', 'items', items()[0], 'image')
    expect(await runImagePick(() => 'row.png', registry, rowTarget)).toBe('written')
    d.resolve(null)
    expect(await run).toBe('dismissed')
  })

  it('frees the lock after a written and a discarded run', async () => {
    const registry = createImagePickRegistry()
    const written = target()
    expect(await runBulkImagePick(() => entries(1), registry, written, alive)).toBe('written')
    expect(registry.has(keyOf(written))).toBe(false)
    const d = deferred<ReturnType<typeof entries>>()
    const pending = target()
    const run = runBulkImagePick(() => d.promise, registry, pending, alive)
    expect(registry.has(keyOf(pending))).toBe(true)
    store().removeBlock('cg-1')
    d.resolve(entries(1))
    expect(await run).toBe('discarded')
    expect(registry.has(keyOf(pending))).toBe(false)
  })
})

describe('a hook that never settles', () => {
  it('keeps the lock until the document generation changes', async () => {
    const registry = createImagePickRegistry()
    const tg = target()
    let calls = 0
    void runBulkImagePick(() => { calls++; return new Promise(() => {}) }, registry, tg, alive)
    await flush()
    expect(registry.has(keyOf(tg))).toBe(true)
    expect(await runBulkImagePick(() => { calls++; return null }, registry, target(), alive)).toBe('refused')
    expect(calls).toBe(1)

    // undo on an empty stack changes nothing, so the key stays locked
    expect(store().undoStack.length).toBe(0)
    store().undo()
    expect(store().configGeneration).toBe(tg.generation)
    expect(await runBulkImagePick(() => { calls++; return null }, registry, target(), alive)).toBe('refused')
    expect(calls).toBe(1)

    // a real undo changes the generation, so a new run gets a new key
    store().updateBlockProps('hero-1', { other: 'y' })
    store().undo()
    expect(store().configGeneration).not.toBe(tg.generation)
    expect(await runBulkImagePick(() => { calls++; return null }, registry, target(), alive)).toBe('dismissed')
    expect(calls).toBe(2)
  })
})

describe('stale results', () => {
  type Mutation = [string, () => void]
  const prepare: Array<[string, () => void]> = [
    ['undo', () => { store().updateBlockProps('hero-1', { other: 'y' }) }],
    ['redo', () => { store().updateBlockProps('hero-1', { other: 'y' }); store().undo() }],
  ]
  const mutations: Mutation[] = [
    ['undo', () => store().undo()],
    ['redo', () => store().redo()],
    ['setConfig', () => store().setConfig(seedConfig())],
    ['removeBlock', () => store().removeBlock('cg-1')],
    ['setActivePage', () => store().setActivePage('page-two')],
  ]

  it.each(mutations)('discards the write with one notice after %s', async (name, mutate) => {
    prepare.find(([n]) => n === name)?.[1]()
    const registry = createImagePickRegistry()
    const tg = target()
    const d = deferred<ReturnType<typeof entries>>()
    const run = runBulkImagePick(() => d.promise, registry, tg, alive)
    mutate()
    if (name === 'undo' || name === 'redo' || name === 'setConfig') {
      expect(store().configGeneration).not.toBe(tg.generation)
    }
    const configAfter = store().config
    const undo = store().undoStack.length
    const t = toastCount()
    d.resolve(entries(3))
    expect(await run).toBe('discarded')
    expect(store().config).toBe(configAfter)
    expect(store().undoStack.length).toBe(undo)
    expect(toastCount()).toBe(t + 1)
    expect(toast.getHistory().at(-1)).toMatchObject({ title: IMAGE_PICK_DISCARDED_MESSAGE })
    expect(registry.has(keyOf(tg))).toBe(false)
  })

  it.each(mutations)('stays silent for null and an empty list after %s', async (name, mutate) => {
    for (const value of [null, []]) {
      store().setConfig(seedConfig())
      prepare.find(([n]) => n === name)?.[1]()
      const d = deferred<unknown>()
      const run = runBulkImagePick(() => d.promise as never, createImagePickRegistry(), target(), alive)
      mutate()
      const configAfter = store().config
      const t = toastCount()
      d.resolve(value)
      expect(await run).toBe('dismissed')
      expect(store().config).toBe(configAfter)
      expect(toastCount()).toBe(t)
    }
  })
})

describe('provider no longer alive', () => {
  it('drops a resolved result silently', async () => {
    let living = true
    const registry = createImagePickRegistry()
    const tg = target()
    const d = deferred<ReturnType<typeof entries>>()
    const run = runBulkImagePick(() => d.promise, registry, tg, () => living)
    const before = store().config
    const t = toastCount()
    living = false
    d.resolve(entries(3))
    expect(await run).toBe('discarded')
    expect(store().config).toBe(before)
    expect(toastCount()).toBe(t)
    expect(registry.has(keyOf(tg))).toBe(false)
  })

  it('drops a rejection silently', async () => {
    let living = true
    const registry = createImagePickRegistry()
    const tg = target()
    const d = deferred<never>()
    const run = runBulkImagePick(() => d.promise, registry, tg, () => living)
    const before = store().config
    const t = toastCount()
    living = false
    d.reject(new Error('boom'))
    expect(await run).toBe('discarded')
    expect(store().config).toBe(before)
    expect(toastCount()).toBe(t)
    expect(registry.has(keyOf(tg))).toBe(false)
  })
})

describe('write', () => {
  it('adds one undo step that restores the prior list', async () => {
    const prior = structuredClone(items())
    const undo = store().undoStack.length
    expect(await runBulkImagePick(() => entries(4), createImagePickRegistry(), target(), alive)).toBe('written')
    expect(store().undoStack.length).toBe(undo + 1)
    expect(items()).toHaveLength(7)
    store().undo()
    expect(items()).toEqual(prior)
  })

  it('reads the list at resolve time and keeps prior entries by identity', async () => {
    const d = deferred<ReturnType<typeof entries>>()
    const run = runBulkImagePick(() => d.promise, createImagePickRegistry(), target(), alive)
    const [first, ...rest] = items()
    const edited = { ...first, title: 'Edited while pending' }
    store().updateBlockProps('cg-1', { items: [edited, ...rest] })
    d.resolve(entries(2))
    expect(await run).toBe('written')
    const after = items()
    expect(after[0].title).toBe('Edited while pending')
    expect(after[0]).toBe(edited)
    rest.forEach((r, i) => expect(after[i + 1]).toBe(r))
    expect(after).toHaveLength(5)
  })

  it('matches the append helper output', async () => {
    const prior = items()
    const images = [{ url: 'u.png', name: 'U' }]
    await runBulkImagePick(() => images, createImagePickRegistry(), target(), alive)
    expect(items()).toEqual(appendPickedItems(prior, images))
  })

  it.each([
    ['missing', undefined],
    ['a string', 'x'],
  ])('treats items that are %s as empty', async (_name, value) => {
    store().updateBlockProps('cg-2', { items: value })
    expect(await runBulkImagePick(() => entries(2), createImagePickRegistry(), target('cg-2'), alive)).toBe('written')
    expect(items('cg-2')).toHaveLength(2)
    expect(items('cg-2')[0]).toMatchObject({ image: 'https://cdn.example/0.png' })
  })
})

describe('a pending single pick', () => {
  it('still lands after a bulk append', async () => {
    const registry = createImagePickRegistry()
    const row = items()[0]
    const single = deferred<string | null>()
    const singleRun = runImagePick(() => single.promise, registry, captureRowTarget('cg-1', 'items', row, 'image'))
    expect(await runBulkImagePick(() => entries(2), registry, target(), alive)).toBe('written')
    single.resolve('single.png')
    expect(await singleRun).toBe('written')
    expect(items()[0].image).toBe('single.png')
    expect(items()).toHaveLength(5)
  })
})

describe('no network at runtime', () => {
  const counts = { fetch: 0, xhr: 0, image: 0 }
  beforeEach(() => {
    counts.fetch = counts.xhr = counts.image = 0
    vi.stubGlobal('fetch', () => { counts.fetch++; return Promise.reject(new Error('no network')) })
    vi.stubGlobal('XMLHttpRequest', class { constructor() { counts.xhr++ } })
    vi.stubGlobal('Image', class { constructor() { counts.image++ } })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('makes no fetch, request, image or element calls for 100 entries', async () => {
    const create = typeof document !== 'undefined' ? vi.spyOn(document, 'createElement') : undefined
    expect(await runBulkImagePick(() => entries(100), createImagePickRegistry(), target(), alive)).toBe('written')
    expect(counts).toEqual({ fetch: 0, xhr: 0, image: 0 })
    if (create) expect(create).not.toHaveBeenCalled()
  })
})
