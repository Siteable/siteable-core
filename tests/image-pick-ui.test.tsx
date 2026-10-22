/**
 * The image pick UI: an optional host hook on the editor layout adds a pick control
 * beside the URL input. Without the hook nothing changes; while a pick is pending the
 * field is locked and the other fields stay editable.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { toast } from 'sonner'
import { useConfigStore } from '../src/store/configStore'
import type { BlockConfig, SiteConfig } from '../src/blocks/types'
import type { EditorLayoutProps } from '../src/editor/EditorLayout'
import { ImagePickProvider } from '../src/editor/image-pick/image-pick-context'
import { ImageUrlField } from '../src/editor/image-pick/image-url-field'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let host: HTMLElement | undefined

function seed() {
  const blocks = [
    { id: 'hero-1', type: 'hero', variant: 'default', props: { heroImage: 'old.png', logo: 'logo.png' } },
  ]
  useConfigStore.getState().setConfig({
    name: 'Test',
    pages: [{ id: 'page-home', name: 'Home', path: '/', blocks }],
    blocks,
  } as unknown as SiteConfig)
}

const block = (): BlockConfig => useConfigStore.getState().config.pages![0].blocks[0]
const prop = (k: string) => block().props[k]

beforeEach(seed)

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  host?.remove()
  host = undefined
})

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function Fields() {
  const b = useConfigStore((s) => s.config.pages![0].blocks[0])
  const update = useConfigStore((s) => s.updateBlockProps)
  return (
    <>
      <ImageUrlField block={b} fieldKey="heroImage" label="Hero image" value={b.props.heroImage} onChange={(v) => update(b.id, { heroImage: v })} />
      <ImageUrlField block={b} fieldKey="logo" label="Logo" value={b.props.logo} onChange={(v) => update(b.id, { logo: v })} />
    </>
  )
}

function mount(hook?: () => Promise<string | null>) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const tree = (
    <ImagePickProvider onPickImage={hook}>
      <Fields />
    </ImagePickProvider>
  )
  act(() => root!.render(tree))
  return host
}

const buttons = () => Array.from(host!.querySelectorAll<HTMLButtonElement>('[data-image-pick]'))
const inputs = () => Array.from(host!.querySelectorAll<HTMLInputElement>('input'))
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const flush = () => act(async () => { await Promise.resolve() })

describe('without a hook', () => {
  it('renders no pick control and the same markup as the text field', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const r = createRoot(el)
    act(() => r.render(<ImageUrlField block={block()} fieldKey="heroImage" label="Hero image" value="old.png" onChange={() => {}} />))
    expect(el.querySelectorAll('button').length).toBe(0)
    expect(el.querySelectorAll('[data-image-pick]').length).toBe(0)

    // Reference: the plain text-field markup rendered by React.
    const refEl = document.createElement('div')
    document.body.appendChild(refEl)
    const rr = createRoot(refEl)
    act(() => rr.render(
      <div className="mb-2.5">
        <label className="block text-[11.5px] text-text-2 mb-1 font-medium">Hero image</label>
        <input
          type="text"
          value="old.png"
          onChange={() => {}}
          className="w-full px-2 py-1.5 rounded border border-border-default bg-bg-2 text-text-0 text-xs outline-none focus:border-green"
        />
      </div>,
    ))
    expect(el.innerHTML).toBe(refEl.innerHTML)
    act(() => { r.unmount(); rr.unmount() })
    refEl.remove()
    el.remove()
  })

  it('renders no control inside a provider that has no hook', () => {
    mount(undefined)
    expect(host!.querySelectorAll('button').length).toBe(0)
    expect(host!.querySelectorAll('[data-image-pick]').length).toBe(0)
  })
})

describe('with a hook', () => {
  it('shows one control per field and writes the picked URL', async () => {
    mount(async () => 'https://img.example/new.png')
    expect(buttons().length).toBe(2)
    expect(buttons()[0].getAttribute('aria-label')).toBe('Choose image for Hero image')
    click(buttons()[0])
    await flush()
    expect(prop('heroImage')).toBe('https://img.example/new.png')
    expect(inputs()[0].value).toBe('https://img.example/new.png')
  })

  it('locks only the pending field and refuses a second pick', async () => {
    const d = deferred<string | null>()
    let calls = 0
    mount(() => { calls += 1; return d.promise })
    click(buttons()[0])
    await flush()
    expect(buttons()[0].getAttribute('aria-busy')).toBe('true')
    expect(buttons()[0].disabled).toBe(true)
    expect(inputs()[0].disabled).toBe(true)
    expect(inputs()[1].disabled).toBe(false)
    expect(buttons()[1].disabled).toBe(false)

    buttons()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(calls).toBe(1)

    // The other field picks concurrently.
    click(buttons()[1])
    await flush()
    expect(calls).toBe(2)

    await act(async () => { d.resolve('a.png') })
    expect(prop('heroImage')).toBe('a.png')
    expect(inputs()[0].disabled).toBe(false)
    expect(buttons()[0].getAttribute('aria-busy')).toBeNull()
  })

  it('keeps the pending state when the field is unmounted and mounted again', async () => {
    const d = deferred<string | null>()
    mount(() => d.promise)
    click(buttons()[0])
    await flush()
    // Re-render the field subtree under the same provider.
    act(() => root!.render(
      <ImagePickProvider onPickImage={() => d.promise}>
        <div key="other" />
      </ImagePickProvider>,
    ))
    act(() => root!.render(
      <ImagePickProvider onPickImage={() => d.promise}>
        <Fields />
      </ImagePickProvider>,
    ))
    expect(buttons()[0].getAttribute('aria-busy')).toBe('true')
    expect(inputs()[0].disabled).toBe(true)
    await act(async () => { d.resolve(null) })
    expect(inputs()[0].disabled).toBe(false)
  })

  it('does nothing and shows no toast when the picker is dismissed', async () => {
    mount(async () => null)
    const before = toast.getHistory().length
    click(buttons()[0])
    await flush()
    expect(prop('heroImage')).toBe('old.png')
    expect(toast.getHistory().length).toBe(before)
  })

  it('shows one error toast when the picker rejects', async () => {
    mount(async () => { throw new Error('boom') })
    const before = toast.getHistory().length
    click(buttons()[0])
    await flush()
    await flush()
    expect(prop('heroImage')).toBe('old.png')
    expect(toast.getHistory().length).toBe(before + 1)
  })
})

describe('types', () => {
  it('accepts onPickImage on the editor layout props', () => {
    const props: EditorLayoutProps = { onPickImage: async () => null }
    expect(typeof props.onPickImage).toBe('function')
  })
})
