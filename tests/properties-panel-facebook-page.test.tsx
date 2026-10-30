/**
 * The Facebook Feed properties panel: three controls, a not-embeddable flag,
 * and address/height edits that reach the store only on blur or Enter.
 *
 * The panel and the canvas preview both render from the config store, so a
 * commit is observed through the same re-render the editor performs.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PropertiesPanel } from '../src/editor/PropertiesPanel'
import { RenderBlock } from '../src/blocks/registry'
import { useConfigStore } from '../src/store/configStore'
import type { BlockConfig } from '../src/blocks/types'
import { FACEBOOK_PAGE_TITLE_CORPUS } from './helpers/facebook-page-injection-corpus'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ACME = 'https://www.facebook.com/acme'
const FLAG_TEXT =
  'This address may not show a Page timeline. Use a public Page link like https://www.facebook.com/yourpage.'

const roots: Root[] = []
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots.length = 0
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  useConfigStore.getState().setConfig({ name: 'Reset', blocks: [] })
})

function render(props: Record<string, unknown>): HTMLElement {
  const block: BlockConfig = { id: 'fb-1', type: 'facebook-page', variant: 'default', props }
  useConfigStore.getState().setConfig({
    name: 'X',
    pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [block] }],
    blocks: [block],
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  function Harness() {
    const current = useConfigStore((s) => s.config.pages![0].blocks.find((b) => b.id === 'fb-1'))
    return (
      <>
        <PropertiesPanel block={current!} />
        <div data-testid="preview">
          <RenderBlock block={current!} />
        </div>
      </>
    )
  }
  act(() => root.render(<Harness />))
  return container
}

function input(container: HTMLElement, labelText: string): HTMLInputElement {
  const label = Array.from(container.querySelectorAll('label')).find(
    (l) => (l.textContent ?? '').trim() === labelText,
  )
  if (!label) throw new Error(`no "${labelText}" control in the panel`)
  const el = label.parentElement!.querySelector('input')
  if (!el) throw new Error(`no input under "${labelText}"`)
  return el
}

// The address control's exact caption is a UI choice; match it by meaning.
const urlInput = (c: HTMLElement): HTMLInputElement => {
  const label = Array.from(c.querySelectorAll('label')).find((l) => /url/i.test(l.textContent ?? ''))
  const el = label?.parentElement?.querySelector('input')
  if (!el) throw new Error('no address control in the panel')
  return el
}
const titleInput = (c: HTMLElement) => input(c, 'Title')
const heightInput = (c: HTMLElement) => input(c, 'Height (px, 70-800)')

/** Type one character at a time, the way a keyboard does. */
function type(el: HTMLInputElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  let value = ''
  for (const ch of text) {
    value += ch
    act(() => {
      setter.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
}

const blur = (el: HTMLInputElement) =>
  act(() => {
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    el.dispatchEvent(new FocusEvent('blur'))
  })

const enter = (el: HTMLInputElement) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })

const frameSrc = (c: HTMLElement) => c.querySelector('[data-testid="preview"] iframe')?.getAttribute('src') ?? null
const flag = (c: HTMLElement) => c.querySelector('[data-embed-flag]')

function spyUpdates() {
  return vi.spyOn(useConfigStore.getState(), 'updateBlockProps').mockClear()
}

describe('facebook feed controls', () => {
  it('shows address, title and height controls', () => {
    const c = render({ url: '', title: '', height: '500' })
    expect(urlInput(c)).toBeTruthy()
    expect(titleInput(c)).toBeTruthy()
    expect(heightInput(c)).toBeTruthy()
  })
})

describe('facebook feed not-embeddable flag', () => {
  it.each(['', '   ', ACME])('is absent for %j', (url) => {
    expect(flag(render({ url, title: '', height: '500' }))).toBeNull()
  })

  it.each([
    'https://example.com/x',
    'http://facebook.com/x',
    'https://facebook.com/plugins',
    'https://facebook.com/%2e/acme',
  ])('is shown for %s', (url) => {
    const el = flag(render({ url, title: '', height: '500' }))
    expect(el).not.toBeNull()
    expect(el!.getAttribute('role')).toBe('status')
    expect((el!.textContent ?? '').trim()).toBe(FLAG_TEXT)
  })

  it('appears after committing a bad address and goes away after a good one', () => {
    const c = render({ url: '', title: '', height: '500' })
    type(urlInput(c), 'https://example.com/x')
    blur(urlInput(c))
    expect(flag(c)).not.toBeNull()
    type(urlInput(c), ACME)
    enter(urlInput(c))
    expect(flag(c)).toBeNull()
  })
})

describe('facebook feed commit on blur or Enter', () => {
  it.each([
    ['address', urlInput, ACME],
    ['height', heightInput, '650'],
  ] as const)('typing in the %s makes no store write and leaves the frame alone', (_n, get, text) => {
    const c = render({ url: ACME, title: '', height: '500' })
    const before = frameSrc(c)
    expect(before).not.toBeNull()
    const spy = spyUpdates()
    type(get(c), text + '1')
    expect(spy).toHaveBeenCalledTimes(0)
    expect(frameSrc(c)).toBe(before)
  })

  it.each([
    ['address', urlInput, 'https://www.facebook.com/other'],
    ['height', heightInput, '650'],
  ] as const)('blur in the %s writes exactly once', (_n, get, text) => {
    const c = render({ url: ACME, title: '', height: '500' })
    const spy = spyUpdates()
    type(get(c), text)
    blur(get(c))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['address', urlInput, 'https://www.facebook.com/other'],
    ['height', heightInput, '650'],
  ] as const)('Enter in the %s writes exactly once', (_n, get, text) => {
    const c = render({ url: ACME, title: '', height: '500' })
    const spy = spyUpdates()
    type(get(c), text)
    enter(get(c))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('updates the frame address after the commit', () => {
    const c = render({ url: ACME, title: '', height: '500' })
    type(urlInput(c), 'https://www.facebook.com/other')
    blur(urlInput(c))
    expect(frameSrc(c)).toContain(encodeURIComponent('https://www.facebook.com/other'))
  })

  it('writes nothing on blur when the draft is unchanged', () => {
    const c = render({ url: ACME, title: '', height: '500' })
    const spy = spyUpdates()
    blur(urlInput(c))
    blur(heightInput(c))
    expect(spy).toHaveBeenCalledTimes(0)
  })

  it('resyncs the draft when the stored value changes from outside', () => {
    const c = render({ url: ACME, title: '', height: '500' })
    act(() => useConfigStore.getState().updateBlockProps('fb-1', { url: 'https://www.facebook.com/first' }))
    act(() => useConfigStore.getState().updateBlockProps('fb-1', { url: 'https://www.facebook.com/second' }))
    expect(urlInput(c).value).toBe('https://www.facebook.com/second')
    act(() => useConfigStore.getState().undo())
    expect(urlInput(c).value).toBe('https://www.facebook.com/first')
  })
})

describe('facebook feed title', () => {
  it.each(FACEBOOK_PAGE_TITLE_CORPUS.slice(0, 12).map((t, i) => [i, t] as const))('renders hostile title %i as plain text', (_i, title) => {
    const c = render({ url: ACME, title: '', height: '500' })
    type(titleInput(c), title)
    const preview = c.querySelector('[data-testid="preview"]')!
    expect(preview.querySelector('script')).toBeNull()
    expect(preview.querySelector('[onerror],[onload],[onclick]')).toBeNull()
    expect(preview.textContent).toContain(title)
  })
})
