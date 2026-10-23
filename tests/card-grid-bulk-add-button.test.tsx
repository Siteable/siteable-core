/**
 * The "add from many images" button in the card grid items editor: when it shows,
 * what a click does, how it locks while the host picker is open, and how the
 * appended rows appear.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { toast } from 'sonner'
import { CardGridItemsEditor } from '../src/editor/card-grid-items-editor/card-grid-items-editor'
import { ImagePickProvider } from '../src/editor/image-pick/image-pick-context'
import { useConfigStore } from '../src/store/configStore'
import type { BlockConfig } from '../src/blocks/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Entry = { url: string; name?: string }
type BulkHook = () => Promise<Entry[] | null> | Entry[] | null
type SingleHook = () => Promise<string | null>

let root: Root | undefined
let host: HTMLElement | undefined

beforeEach(() => {
  // jsdom reports no document focus; a real user session has it.
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
  act(() => root?.unmount())
  root = undefined
  host?.remove()
  host = undefined
})

function seed(items: Array<Record<string, unknown>>, blockIds: string[] = ['cg-1']) {
  const blocks: BlockConfig[] = blockIds.map((id) => ({ id, type: 'card-grid', variant: 'product', props: { items } }))
  useConfigStore.getState().setConfig({
    name: 'X',
    pages: [{ id: 'page-home', name: 'Home', path: '/', blocks }],
    blocks,
  })
}

const stored = (id = 'cg-1') =>
  useConfigStore.getState().config.pages![0].blocks.find((b) => b.id === id)!.props.items as Array<Record<string, unknown>>

function Harness({ ids }: { ids: string[] }) {
  const blocks = useConfigStore((s) => s.config.pages![0].blocks)
  return (
    <>
      {ids.map((id) => (
        <div key={id} data-editor={id}>
          <CardGridItemsEditor block={blocks.find((b) => b.id === id)!} label="Products" />
        </div>
      ))}
    </>
  )
}

function tree(props: { onPickImage?: SingleHook; onPickImages?: BulkHook }, ids: string[]): ReactElement {
  return (
    <ImagePickProvider onPickImage={props.onPickImage} onPickImages={props.onPickImages}>
      <Harness ids={ids} />
    </ImagePickProvider>
  )
}

function mount(props: { onPickImage?: SingleHook; onPickImages?: BulkHook }, ids: string[] = ['cg-1']) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(tree(props, ids)))
}

function rerender(props: { onPickImage?: SingleHook; onPickImages?: BulkHook }, ids: string[] = ['cg-1']) {
  act(() => root!.render(tree(props, ids)))
}

const scope = (id: string) => host!.querySelector<HTMLElement>(`[data-editor="${id}"]`)!
const bulkButtons = (el: ParentNode = host!) => Array.from(el.querySelectorAll<HTMLButtonElement>('[data-bulk-image-pick]'))
const bulk = (id = 'cg-1') => bulkButtons(scope(id))[0]
const rows = (id = 'cg-1') => Array.from(scope(id).querySelectorAll<HTMLElement>('[data-card-grid-item]'))
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const search = () => host!.querySelector<HTMLInputElement>('input[type="search"]')!

function typeInto(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/** A hook that stays open until the test settles it. */
function pendingHook() {
  const d = deferred<Entry[] | null>()
  const hook = vi.fn<BulkHook>(() => d.promise)
  return { hook, ...d }
}

const settle = (fn: () => void) => act(async () => { fn(); await Promise.resolve() })
const singleHook: SingleHook = () => Promise.resolve('https://img.example/single.png')
const toastCount = () => toast.getHistory().length
const entries = (n: number, from = 1): Entry[] =>
  Array.from({ length: n }, (_, i) => ({ url: `https://img.example/${from + i}.png`, name: `Picked ${from + i}` }))

describe('when the button shows', () => {
  it.each([
    ['neither hook', false, false, 0],
    ['only the single image hook', true, false, 0],
    ['only the bulk hook', false, true, 1],
    ['both hooks', true, true, 1],
  ])('with %s', (_name, single, many, bulkCount) => {
    seed([{ name: 'A' }])
    mount({ onPickImage: single ? singleHook : undefined, onPickImages: many ? () => null : undefined })
    expect(bulkButtons()).toHaveLength(bulkCount)
    const singleControls = host!.querySelectorAll('[data-image-pick]').length
    if (single) expect(singleControls).toBeGreaterThan(0)
    else expect(singleControls).toBe(0)
    if (bulkCount) expect(bulk().textContent).toBe('+ Add from many images')
  })

  it('follows a hook that is added and removed after the first render', () => {
    seed([{ name: 'A' }])
    mount({})
    expect(bulkButtons()).toHaveLength(0)
    rerender({ onPickImages: () => null })
    expect(bulkButtons()).toHaveLength(1)
    rerender({})
    expect(bulkButtons()).toHaveLength(0)
  })

  it('is not mistaken for the add item button', () => {
    seed([{ name: 'A' }])
    mount({ onPickImages: () => null })
    expect(bulk().textContent).not.toContain('Add item')
    expect(bulk().hasAttribute('data-image-pick')).toBe(false)
  })
})

describe('a click', () => {
  it('clears the items search and calls the hook once', () => {
    seed([{ name: 'Runner 1' }, { name: 'Cap 2' }])
    const p = pendingHook()
    mount({ onPickImages: p.hook })
    typeInto(search(), 'Runner')
    expect(search().value).toBe('Runner')
    expect(rows()).toHaveLength(1)
    click(bulk())
    expect(search().value).toBe('')
    expect(rows()).toHaveLength(2)
    expect(p.hook).toHaveBeenCalledTimes(1)
  })

  it('disables the button and marks it busy while the picker is open', () => {
    seed([{ name: 'A' }])
    const p = pendingHook()
    mount({ onPickImages: p.hook })
    expect(bulk().disabled).toBe(false)
    expect(bulk().hasAttribute('aria-busy')).toBe(false)
    click(bulk())
    expect(bulk().disabled).toBe(true)
    expect(bulk().getAttribute('aria-busy')).toBe('true')
    click(bulk())
    expect(p.hook).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['is dismissed', (p: ReturnType<typeof pendingHook>) => p.resolve(null)],
    ['fails', (p: ReturnType<typeof pendingHook>) => p.reject(new Error('boom'))],
    ['returns a list with no valid entry', (p: ReturnType<typeof pendingHook>) => p.resolve([{ url: '' }])],
    ['writes rows', (p: ReturnType<typeof pendingHook>) => p.resolve(entries(2))],
  ])('enables the button again when the pick %s', async (_name, finish) => {
    seed([{ name: 'A' }])
    const p = pendingHook()
    mount({ onPickImages: p.hook })
    click(bulk())
    expect(bulk().disabled).toBe(true)
    await settle(() => finish(p))
    expect(bulk().disabled).toBe(false)
    expect(bulk().hasAttribute('aria-busy')).toBe(false)
  })

  it('enables the button again when the result is discarded after the configuration was replaced', async () => {
    seed([{ name: 'A' }])
    const p = pendingHook()
    mount({ onPickImages: p.hook })
    click(bulk())
    act(() => seed([{ name: 'Other' }]))
    await settle(() => p.resolve(entries(2)))
    expect(bulk().disabled).toBe(false)
    expect(stored()).toHaveLength(1)
  })

  it('locks only its own block and does not mix with a row pick', () => {
    seed([{ name: 'A' }], ['cg-1', 'cg-2'])
    const first = pendingHook()
    const second = pendingHook()
    const hooks = [first.hook, second.hook]
    mount({ onPickImages: () => hooks.shift()!() }, ['cg-1', 'cg-2'])
    click(bulk('cg-1'))
    expect(bulk('cg-1').disabled).toBe(true)
    expect(bulk('cg-2').disabled).toBe(false)
    click(bulk('cg-2'))
    expect(second.hook).toHaveBeenCalledTimes(1)
  })

  it('stays enabled while a single image pick is open in the same block', () => {
    seed([{ name: 'A' }])
    const single = deferred<string | null>()
    mount({ onPickImage: () => single.promise, onPickImages: () => null })
    click(rows()[0].querySelector('[data-image-pick]')!)
    expect(bulk().disabled).toBe(false)
  })
})

describe('the appended rows', () => {
  it('are added in order with their names and urls, and one undo removes them all', async () => {
    seed([{ name: 'A' }])
    const p = pendingHook()
    mount({ onPickImages: p.hook })
    click(bulk())
    await settle(() => p.resolve(entries(3)))
    expect(stored()).toHaveLength(4)
    expect(stored().slice(1).map((i) => i.name)).toEqual(['Picked 1', 'Picked 2', 'Picked 3'])
    expect(stored().slice(1).map((i) => i.image)).toEqual(entries(3).map((e) => e.url))
    expect(rows()).toHaveLength(4)
    act(() => useConfigStore.getState().undo())
    expect(stored()).toEqual([{ name: 'A' }])
  })

  it('leave a row with an open single image pick able to receive its image', async () => {
    seed([{ name: 'A', image: '' }])
    const single = deferred<string | null>()
    const p = pendingHook()
    mount({ onPickImage: () => single.promise, onPickImages: p.hook })
    click(rows()[0].querySelector('[data-image-pick]')!)
    click(bulk())
    await settle(() => p.resolve(entries(2)))
    await settle(() => single.resolve('https://img.example/late.png'))
    expect(stored()).toHaveLength(3)
    expect(stored()[0].image).toBe('https://img.example/late.png')
  })

  it('are written after an edit made while the picker was open, keeping that edit', async () => {
    seed([{ name: 'A' }])
    const p = pendingHook()
    mount({ onPickImages: p.hook })
    click(bulk())
    typeInto(rows()[0].querySelectorAll('input')[2], 'Renamed')
    await settle(() => p.resolve(entries(1)))
    expect(stored().map((i) => i.name)).toEqual(['Renamed', 'Picked 1'])
  })

  it('are dropped when an undo ran while the picker was open', async () => {
    seed([{ name: 'A' }])
    const p = pendingHook()
    mount({ onPickImages: p.hook })
    typeInto(rows()[0].querySelectorAll('input')[2], 'Edited')
    click(bulk())
    act(() => useConfigStore.getState().undo())
    const after = stored()
    await settle(() => p.resolve(entries(2)))
    expect(stored()).toBe(after)
    expect(stored()).toHaveLength(1)
  })

  it('all show up even when a row input has focus while the picker is open', async () => {
    seed([{ name: 'A' }, { name: 'B' }])
    const p = pendingHook()
    mount({ onPickImages: p.hook })
    click(bulk())
    const input = rows()[0].querySelectorAll('input')[2]
    act(() => input.focus())
    expect(document.activeElement).toBe(input)
    await settle(() => p.resolve(entries(30)))
    expect(stored()).toHaveLength(32)
    expect(rows()).toHaveLength(32)
    expect(document.activeElement).toBe(input)
    expect(rows()[0].querySelectorAll('input')[2]).toBe(input)
  })
})

describe('when the editor goes away while the picker is open', () => {
  it('writes nothing, shows no notice and raises no unhandled rejection', async () => {
    seed([{ name: 'A' }])
    const p = pendingHook()
    mount({ onPickImages: p.hook })
    click(bulk())
    const before = useConfigStore.getState().config
    const notices = toastCount()
    const rejections: unknown[] = []
    const onRejection = (e: unknown) => rejections.push(e)
    process.on('unhandledRejection', onRejection)
    act(() => root!.unmount())
    root = undefined
    await settle(() => p.resolve(entries(3)))
    await new Promise((r) => setTimeout(r, 0))
    process.off('unhandledRejection', onRejection)
    expect(useConfigStore.getState().config).toBe(before)
    expect(toastCount()).toBe(notices)
    expect(rejections).toEqual([])
  })
})
