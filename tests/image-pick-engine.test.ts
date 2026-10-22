/**
 * The image pick engine turns the result of a host-supplied picker into exactly one
 * outcome: write the URL, do nothing, show one error, or drop a stale result with
 * one notice. It never fetches, stores or executes the URL.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { useConfigStore } from '../src/store/configStore'
import type { SiteConfig } from '../src/blocks/types'
import { createImagePickRegistry } from '../src/editor/image-pick/image-pick-registry'
import {
  captureFieldTarget,
  captureRowTarget,
  type PickTarget,
} from '../src/editor/image-pick/image-pick-target'
import {
  runImagePick,
  IMAGE_PICK_FAILED_MESSAGE,
  IMAGE_PICK_DISCARDED_MESSAGE,
} from '../src/editor/image-pick/run-image-pick'

type Row = { src: string; alt: string }
const makeRows = (): Row[] => [
  { src: 'a.png', alt: 'a' },
  { src: 'b.png', alt: 'b' },
  { src: 'c.png', alt: 'c' },
]

function seedConfig(): SiteConfig {
  const home = [
    { id: 'hero-1', type: 'hero', variant: 'default', props: { title: 'T', heroImage: 'old.png', other: 'x' } },
    { id: 'gallery-1', type: 'gallery', variant: 'default', props: { images: makeRows() } },
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
const heroImage = () => homeBlock('hero-1').props.heroImage
const rows = () => homeBlock('gallery-1').props.images as Row[]
const toastCount = () => toast.getHistory().length

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type Kind = 'field' | 'row'
const capture = (kind: Kind): PickTarget =>
  kind === 'field'
    ? captureFieldTarget('hero-1', 'heroImage')
    : captureRowTarget('gallery-1', 'images', rows()[1], 'src')
const read = (kind: Kind) => (kind === 'field' ? heroImage() : rows()[1].src)

beforeEach(() => {
  store().setConfig(seedConfig())
})

describe.each<Kind>(['field', 'row'])('outcomes (%s)', (kind) => {
  it('stores the returned string exactly as returned', async () => {
    for (const value of ['https://cdn.example/a.png', '  x  ', 'javascript:alert(1)']) {
      const outcome = await runImagePick(() => value, createImagePickRegistry(), capture(kind))
      expect(outcome).toBe('written')
      expect(read(kind)).toBe(value)
    }
  })

  it('awaits an asynchronous result', async () => {
    const d = deferred<string | null>()
    const run = runImagePick(() => d.promise, createImagePickRegistry(), capture(kind))
    expect(read(kind)).not.toBe('later.png')
    d.resolve('later.png')
    expect(await run).toBe('written')
    expect(read(kind)).toBe('later.png')
  })

  it('treats null as a silent dismissal', async () => {
    const before = structuredClone(store().config)
    const undo = store().undoStack.length
    const t = toastCount()
    const outcome = await runImagePick(() => null, createImagePickRegistry(), capture(kind))
    expect(outcome).toBe('dismissed')
    expect(store().config).toEqual(before)
    expect(store().undoStack.length).toBe(undo)
    expect(toastCount()).toBe(t)
  })

  it.each([
    ['rejection', () => Promise.reject(new Error('boom'))],
    ['synchronous throw', () => { throw new Error('boom') }],
    ['undefined', () => undefined],
    ['number', () => 42],
    ['object', () => ({})],
  ])('fails with one error toast on %s', async (_name, hook) => {
    const before = structuredClone(store().config)
    const undo = store().undoStack.length
    const t = toastCount()
    const registry = createImagePickRegistry()
    const target = capture(kind)
    const outcome = await runImagePick(hook as never, registry, target)
    expect(outcome).toBe('failed')
    expect(store().config).toEqual(before)
    expect(store().undoStack.length).toBe(undo)
    expect(toastCount()).toBe(t + 1)
    expect(toast.getHistory().at(-1)).toMatchObject({ title: IMAGE_PICK_FAILED_MESSAGE })
    // the lock is released after a failure
    expect(await runImagePick(() => 'again.png', registry, capture(kind))).toBe('written')
  })
})

describe.each<Kind>(['field', 'row'])('stale results (%s)', (kind) => {
  const mutations: Array<[string, () => void]> = [
    ['block removed', () => store().removeBlock(kind === 'field' ? 'hero-1' : 'gallery-1')],
    ['active page switched', () => store().setActivePage('page-two')],
    ['page added', () => { store().addPage('New', '/new') }],
    ['page removed', () => store().removePage('page-home')],
    ['undo', () => { store().updateBlockProps('hero-2', { x: 1 }); store().undo() }],
    ['redo', () => {
      store().updateBlockProps('hero-1', { other: 'y' })
      store().undo()
      store().redo()
    }],
    ['config replaced with the same ids', () => store().setConfig(seedConfig())],
  ]

  it.each(mutations)('drops the write with one notice: %s', async (_name, mutate) => {
    const d = deferred<string | null>()
    const run = runImagePick(() => d.promise, createImagePickRegistry(), capture(kind))
    mutate()
    const configAfter = store().config
    const undo = store().undoStack.length
    const t = toastCount()
    d.resolve('late.png')
    expect(await run).toBe('discarded')
    expect(store().config).toBe(configAfter)
    expect(store().undoStack.length).toBe(undo)
    expect(toastCount()).toBe(t + 1)
    expect(toast.getHistory().at(-1)).toMatchObject({ title: IMAGE_PICK_DISCARDED_MESSAGE })
  })
})

describe('row targets', () => {
  it('writes to the captured row after other rows are edited', async () => {
    const d = deferred<string | null>()
    const run = runImagePick(() => d.promise, createImagePickRegistry(), capture('row'))
    const list = rows()
    store().updateBlockProps('gallery-1', { images: [{ ...list[0], alt: 'edited' }, list[1], list[2]] })
    d.resolve('new.png')
    expect(await run).toBe('written')
    expect(rows().map((r) => r.src)).toEqual(['a.png', 'new.png', 'c.png'])
    expect(rows()[0].alt).toBe('edited')
  })

  it('writes at the new index after a reorder and leaves other rows untouched', async () => {
    const [a, b, c] = rows()
    const d = deferred<string | null>()
    const run = runImagePick(() => d.promise, createImagePickRegistry(), capture('row'))
    store().updateBlockProps('gallery-1', { images: [c, a, b] })
    d.resolve('new.png')
    expect(await run).toBe('written')
    const after = rows()
    expect(after.map((r) => r.src)).toEqual(['c.png', 'a.png', 'new.png'])
    expect(after[0]).toBe(c)
    expect(after[1]).toBe(a)
    expect(after[2]).not.toBe(b)
    expect(after[2].alt).toBe('b')
  })

  it('discards when the captured row was removed', async () => {
    const [a, , c] = rows()
    const d = deferred<string | null>()
    const run = runImagePick(() => d.promise, createImagePickRegistry(), capture('row'))
    store().updateBlockProps('gallery-1', { images: [a, c] })
    d.resolve('new.png')
    expect(await run).toBe('discarded')
    expect(rows().map((r) => r.src)).toEqual(['a.png', 'c.png'])
  })

  it('discards when the captured row was replaced by an edited copy', async () => {
    const [a, b, c] = rows()
    const d = deferred<string | null>()
    const run = runImagePick(() => d.promise, createImagePickRegistry(), capture('row'))
    store().updateBlockProps('gallery-1', { images: [a, { ...b, alt: 'changed' }, c] })
    d.resolve('new.png')
    expect(await run).toBe('discarded')
    expect(rows()[1].src).toBe('b.png')
  })
})

describe('concurrency and refusal', () => {
  it('lets picks on different targets resolve in reverse order into their own targets', async () => {
    const registry = createImagePickRegistry()
    const first = deferred<string | null>()
    const second = deferred<string | null>()
    const runA = runImagePick(() => first.promise, registry, capture('field'))
    const runB = runImagePick(() => second.promise, registry, capture('row'))
    second.resolve('row.png')
    expect(await runB).toBe('written')
    first.resolve('field.png')
    expect(await runA).toBe('written')
    expect(heroImage()).toBe('field.png')
    expect(rows()[1].src).toBe('row.png')
  })

  it.each<Kind>(['field', 'row'])('refuses a second pick on a pending target (%s)', async (kind) => {
    const registry = createImagePickRegistry()
    const d = deferred<string | null>()
    let calls = 0
    const run = runImagePick(() => { calls++; return d.promise }, registry, capture(kind))
    const t = toastCount()
    const second = await runImagePick(() => { calls++; return 'x.png' }, registry, capture(kind))
    expect(second).toBe('refused')
    expect(calls).toBe(1)
    expect(toastCount()).toBe(t)
    d.resolve('one.png')
    expect(await run).toBe('written')
    expect(await runImagePick(() => 'two.png', registry, capture(kind))).toBe('written')
    expect(read(kind)).toBe('two.png')
  })

  it('releases the lock after a dismissal and a discard', async () => {
    const registry = createImagePickRegistry()
    expect(await runImagePick(() => null, registry, capture('field'))).toBe('dismissed')
    const d = deferred<string | null>()
    const run = runImagePick(() => d.promise, registry, capture('field'))
    store().removeBlock('hero-1')
    d.resolve('x.png')
    expect(await run).toBe('discarded')
    store().setConfig(seedConfig())
    expect(await runImagePick(() => 'y.png', registry, capture('field'))).toBe('written')
  })

  it('does not treat a replaced config as pending for the same block ids', async () => {
    const registry = createImagePickRegistry()
    const d = deferred<string | null>()
    const run = runImagePick(() => d.promise, registry, capture('field'))
    store().setConfig(seedConfig())
    expect(await runImagePick(() => 'fresh.png', registry, capture('field'))).toBe('written')
    d.resolve('stale.png')
    expect(await run).toBe('discarded')
    expect(heroImage()).toBe('fresh.png')
  })
})

describe('registry', () => {
  it('tracks locks, notifies subscribers and bumps its version', () => {
    const registry = createImagePickRegistry()
    const seen: number[] = []
    const off = registry.subscribe(() => seen.push(registry.getVersion()))
    expect(registry.tryAcquire('k')).toBe(true)
    expect(registry.tryAcquire('k')).toBe(false)
    expect(registry.has('k')).toBe(true)
    registry.release('k')
    expect(registry.has('k')).toBe(false)
    expect(seen.length).toBe(2)
    off()
    registry.tryAcquire('z')
    expect(seen.length).toBe(2)
  })
})
