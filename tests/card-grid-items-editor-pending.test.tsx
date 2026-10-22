/**
 * Row locking while an image pick is pending in the card grid items editor.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { toast } from 'sonner'
import { CardGridItemsEditor } from '../src/editor/card-grid-items-editor/card-grid-items-editor'
import { ImagePickProvider } from '../src/editor/image-pick/image-pick-context'
import { IMAGE_PICK_DISCARDED_MESSAGE } from '../src/editor/image-pick/run-image-pick'
import { useConfigStore } from '../src/store/configStore'
import type { BlockConfig } from '../src/blocks/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let host: HTMLElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  host?.remove()
  host = undefined
})

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

const ITEMS = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]

function setup(hook: () => Promise<string | null>) {
  const block: BlockConfig = { id: 'cg-1', type: 'card-grid', variant: 'product', props: { items: ITEMS } }
  useConfigStore.getState().setConfig({
    name: 'X',
    pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [block] }],
    blocks: [block],
  })
  function Harness() {
    const b = useConfigStore((s) => s.config.pages![0].blocks[0])
    if (!b) return null
    return <CardGridItemsEditor block={b} label="Products" />
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(<ImagePickProvider onPickImage={hook}><Harness /></ImagePickProvider>))
}

const rows = () => Array.from(host!.querySelectorAll<HTMLElement>('[data-card-grid-item]'))
const stored = () => useConfigStore.getState().config.pages![0].blocks[0].props.items as Array<Record<string, unknown>>
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
/** Finds a row action by its generic name ("Move up", "Remove"); the real name carries the item number. */
const btn = (row: HTMLElement, label: string) => {
  const [verb, ...rest] = label.split(' ')
  const pattern = new RegExp(`^${verb} item \\d+${rest.length ? ` ${rest.join(' ')}` : ''}$`)
  return Array.from(row.querySelectorAll<HTMLButtonElement>('button')).find((b) => pattern.test(b.getAttribute('aria-label') ?? ''))!
}
const pick = (row: HTMLElement) => row.querySelector<HTMLButtonElement>('[data-image-pick]')!
const flush = () => act(async () => { await Promise.resolve() })

describe('pending row', () => {
  it('locks only the pending row', async () => {
    const d = deferred<string | null>()
    setup(() => d.promise)
    click(pick(rows()[1]))
    await flush()
    const [r1, r2, r3] = rows()
    expect(r2.getAttribute('aria-busy')).toBe('true')
    for (const input of r2.querySelectorAll('input')) expect(input.disabled).toBe(true)
    for (const label of ['Move up', 'Move down', 'Duplicate', 'Remove']) expect(btn(r2, label).disabled).toBe(true)
    expect(pick(r2).disabled).toBe(true)
    for (const r of [r1, r3]) {
      expect(r.getAttribute('aria-busy')).toBeNull()
      for (const input of r.querySelectorAll('input')) expect(input.disabled).toBe(false)
      expect(btn(r, 'Duplicate').disabled).toBe(false)
      expect(pick(r).disabled).toBe(false)
    }
  })

  it('refuses a second pick on the same row', async () => {
    const d = deferred<string | null>()
    let calls = 0
    setup(() => { calls += 1; return d.promise })
    click(pick(rows()[1]))
    await flush()
    click(pick(rows()[1]))
    await flush()
    expect(calls).toBe(1)
  })

  it('writes to the captured item after it was moved, keeping other objects', async () => {
    const d = deferred<string | null>()
    setup(() => d.promise)
    click(pick(rows()[1]))
    await flush()
    // Move row 1 below the pending row.
    click(btn(rows()[0], 'Move down'))
    expect(stored().map((i) => i.name)).toEqual(['B', 'A', 'C'])
    const before = stored()
    await act(async () => { d.resolve('https://img.example/b.png') })
    await flush()
    const after = stored()
    expect(after[0]).toEqual({ name: 'B', image: 'https://img.example/b.png' })
    expect(after[1]).toBe(before[1])
    expect(after[2]).toBe(before[2])
    expect(rows()[0].getAttribute('aria-busy')).toBeNull()
  })

  it('discards the result with a toast when the block is gone', async () => {
    const d = deferred<string | null>()
    setup(() => d.promise)
    click(pick(rows()[1]))
    await flush()
    const t = toast.getHistory().length
    act(() => useConfigStore.getState().removeBlock('cg-1'))
    await act(async () => { d.resolve('https://img.example/b.png') })
    await flush()
    expect(toast.getHistory().length).toBe(t + 1)
    expect(toast.getHistory().at(-1)).toMatchObject({ title: IMAGE_PICK_DISCARDED_MESSAGE })
  })
})
