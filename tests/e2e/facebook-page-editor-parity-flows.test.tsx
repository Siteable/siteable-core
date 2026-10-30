/**
 * Editor and export agreement for the Facebook Feed block, plus its presence in
 * the insert list and the layers panel.
 *
 * Both sides are built from the same props: the editor side mounts the real
 * block renderer, the exported side runs the real exporter and parses its
 * output. The frame attributes and the wrapper's width cap and centering must
 * match, or both sides must show the placeholder.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { exportSiteToHTML } from '../../src/lib/export-html'
import { RenderBlock } from '../../src/blocks/registry'
import { LeftSidebar } from '../../src/editor/LeftSidebar'
import { LayersPanel } from '../../src/editor/LayersPanel'
import { useConfigStore } from '../../src/store/configStore'
import { useEditorStore } from '../../src/store/editorStore'
import { blockMetadata } from '../../src/lib/block-metadata'
import type { BlockConfig, SiteConfig } from '../../src/blocks/types'
import { FACEBOOK_PAGE_TITLE_CORPUS } from '../helpers/facebook-page-injection-corpus'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots.length = 0
  document.body.innerHTML = ''
  useConfigStore.getState().setConfig({ name: 'Reset', blocks: [] })
  useEditorStore.getState().selectBlock(null)
})

const block = (props: Record<string, unknown>): BlockConfig => ({
  id: 'fb-1',
  type: 'facebook-page',
  variant: 'default',
  props,
})

interface Seen {
  iframe: Record<string, string | null> | null
  maxWidth: string
  marginLeft: string
  marginRight: string
}

function readFrame(root: ParentNode): Seen {
  const iframe = root.querySelector('iframe')
  const holder = (iframe ? iframe.parentElement : root.querySelector('[style*="max-width"]')) as HTMLElement | null
  // The capped wrapper is the element carrying the width cap.
  const capped = (iframe?.closest('[style*="max-width"]') ?? holder) as HTMLElement | null
  return {
    iframe: iframe
      ? {
          src: iframe.getAttribute('src'),
          title: iframe.getAttribute('title'),
          height: iframe.getAttribute('height'),
          loading: iframe.getAttribute('loading'),
          referrerpolicy: iframe.getAttribute('referrerpolicy'),
        }
      : null,
    maxWidth: capped?.style.maxWidth ?? '',
    marginLeft: capped?.style.marginLeft ?? '',
    marginRight: capped?.style.marginRight ?? '',
  }
}

function editorSide(b: BlockConfig): Seen {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<RenderBlock block={b} />))
  return readFrame(container)
}

function exportSide(b: BlockConfig): Seen {
  const html = exportSiteToHTML({ name: 'Site', blocks: [b] } as SiteConfig)
  return readFrame(new DOMParser().parseFromString(html, 'text/html'))
}

const ACME = 'https://www.facebook.com/acme'

const ROWS: Array<[string, Record<string, unknown>]> = [
  ['plain address', { url: ACME }],
  ['address without www', { url: 'https://facebook.com/acme' }],
  ['mobile host', { url: 'https://m.facebook.com/acme' }],
  ['trailing slash', { url: ACME + '/' }],
  ['numeric profile id', { url: 'https://www.facebook.com/profile.php?id=123456' }],
  ['wrong host', { url: 'https://example.com/acme' }],
  ['insecure scheme', { url: 'http://facebook.com/acme' }],
  ['reserved path', { url: 'https://facebook.com/plugins' }],
  ['empty address', { url: '' }],
  ['missing address', {}],
  ['non-string address', { url: 42 }],
  ['height zero', { url: ACME, height: 0 }],
  ['height above the maximum', { url: ACME, height: 801 }],
  ['height not a number', { url: ACME, height: 'abc' }],
  ['height as digit string', { url: ACME, height: '600' }],
  ['height as number', { url: ACME, height: 300 }],
  ['title set', { url: ACME, title: 'Our feed' }],
  ['title unset', { url: ACME }],
  ['title empty', { url: ACME, title: '' }],
  ['title not a string', { url: ACME, title: 12 }],
  ['title object', { url: ACME, title: { a: 1 } }],
  ['title with markup', { url: ACME, title: '<b>"x" & y</b>' }],
  ...FACEBOOK_PAGE_TITLE_CORPUS.slice(0, 8).map((t, i): [string, Record<string, unknown>] => [
    `hostile title ${i}`,
    { url: ACME, title: t },
  ]),
]

describe('facebook feed editor and export agreement', () => {
  it.each(ROWS)('shows the same frame or placeholder on both sides: %s', (_name, props) => {
    const editor = editorSide(block(props))
    const exported = exportSide(block(props))

    expect(editor.iframe === null).toBe(exported.iframe === null)
    expect(editor.iframe).toEqual(exported.iframe)
    expect(editor.maxWidth).toBe('340px')
    expect(exported.maxWidth).toBe('340px')
    expect(editor.marginLeft).toBe('auto')
    expect(editor.marginRight).toBe('auto')
    expect(exported.marginLeft).toBe('auto')
    expect(exported.marginRight).toBe('auto')
    if (editor.iframe) {
      expect(editor.iframe.referrerpolicy).toBe('strict-origin-when-cross-origin')
      expect(editor.iframe.loading).toBe('lazy')
    }
  })

  it('falls back to the default frame title when none is set', () => {
    expect(editorSide(block({ url: ACME })).iframe?.title).toBe('Facebook Page')
  })
})

describe('facebook feed insert list and layers', () => {
  function openComponents(container: HTMLElement): void {
    const tab = Array.from(container.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === 'Components',
    )!
    act(() => tab.click())
  }

  function mountSidebar(): HTMLElement {
    useConfigStore.getState().setConfig({
      name: 'X',
      pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [] }],
      blocks: [],
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() => root.render(<LeftSidebar />))
    openComponents(container)
    return container
  }

  const entry = (container: HTMLElement): HTMLButtonElement | undefined =>
    Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').trim().startsWith('Facebook Feed'),
    )

  it('lists the block as Facebook Feed in the insert list', () => {
    expect(entry(mountSidebar())).toBeDefined()
  })

  it('adds a block with its default props and selects it when clicked', () => {
    const container = mountSidebar()
    act(() => entry(container)!.click())
    const blocks = useConfigStore.getState().config.pages![0].blocks
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('facebook-page')
    const meta = blockMetadata.find((m) => m.type === 'facebook-page')!
    expect(blocks[0].props).toEqual(meta.defaultProps)
    expect(useEditorStore.getState().selectedBlockId).toBe(blocks[0].id)
  })

  it('finds the block when searching for facebook', () => {
    const container = mountSidebar()
    const search = container.querySelector('input[type="text"]') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setter.call(search, 'facebook')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(entry(container)).toBeDefined()
  })

  it('names the block Facebook Feed in the layers panel', () => {
    const b = block({ url: ACME })
    useConfigStore.getState().setConfig({
      name: 'X',
      pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [b] }],
      blocks: [b],
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() => root.render(<LayersPanel />))
    expect(container.textContent).toContain('Facebook Feed')
  })
})
