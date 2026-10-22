/**
 * Card-grid editor-to-visitor flow.
 *
 * A block inserted from the palette, filled through the properties panel and
 * switched to the filter layout is exported with the real exporter, mounted with
 * its inline runtime, and driven as a visitor would drive it: a category click,
 * a keyboard activation on another category, then "All". The editor preview of
 * the same block stays in the document and must keep showing every card with no
 * filter control.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, createElement, Fragment, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { exportSiteToHTML } from '../../src/lib/export-html'
import { RenderBlock } from '../../src/blocks/registry'
import { LeftSidebar } from '../../src/editor/LeftSidebar'
import { PropertiesPanel } from '../../src/editor/PropertiesPanel'
import { useConfigStore } from '../../src/store/configStore'
import { FIXTURE_BLOCKS } from '../helpers/behavior-fixtures'
import { filterButtonsIn, filterCardsIn, filterScopes } from '../helpers/behavior-test-table-filter'
import type { BlockConfig, SiteConfig } from '../../src/blocks/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

const click = (element: Element): void => {
  ;(element as HTMLElement).click()
}

const press = (key: string): void => {
  const target = document.activeElement ?? document.body
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

function mediaQuery(matches: boolean): MediaQueryList {
  return {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  } as MediaQueryList
}

const roots: Root[] = []

function mountReact(node: ReactElement): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(node))
  return container
}

function unmountAll(): void {
  for (const root of roots) act(() => root.unmount())
  roots.length = 0
}

let runtime = ''

beforeAll(() => {
  runtime =
    parse(exportSiteToHTML({ name: 'Site', blocks: FIXTURE_BLOCKS['card-grid-filter'] }))
      .querySelector('script[data-sb-runtime]')
      ?.textContent ?? ''
  expect(runtime).not.toBe('')
  // The source installs delegated listeners and is not idempotent: run it once.
  new Function(runtime)()
})

afterEach(() => {
  unmountAll()
  document.body.innerHTML = ''
  ;(window as unknown as { matchMedia?: unknown }).matchMedia = undefined
})

// ---------------------------------------------------------------------------
// Panel helpers
// ---------------------------------------------------------------------------

function field(container: HTMLElement, labelText: string): HTMLElement {
  const label = Array.from(container.querySelectorAll('label')).find(
    (candidate) => (candidate.textContent ?? '').trim() === labelText,
  )
  if (!label) throw new Error(`no "${labelText}" field in the panel`)
  return label.parentElement as HTMLElement
}

function itemCards(container: HTMLElement): HTMLElement[] {
  return Array.from(field(container, 'Products').querySelectorAll<HTMLElement>('.bg-bg-2'))
}

function setText(container: HTMLElement, itemIndex: number, labelText: string, value: string): void {
  const card = itemCards(container)[itemIndex]
  const label = Array.from(card.querySelectorAll('label')).find(
    (candidate) => (candidate.textContent ?? '').trim() === labelText,
  )
  if (!label) throw new Error(`no "${labelText}" input on item ${itemIndex}`)
  const input = label.parentElement!.querySelector('input')!
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function choose(container: HTMLElement, labelText: string, value: string): void {
  const select = field(container, labelText).querySelector('select')!
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
  act(() => {
    setter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

const storedBlocks = (): BlockConfig[] => useConfigStore.getState().config.pages![0].blocks

/** Observations read through the shared filter helpers, not local duplicates. */
const scopeOf = (): HTMLElement | null => filterScopes()[0] ?? null
const buttonsOf = (): HTMLButtonElement[] => {
  const scope = scopeOf()
  return scope ? filterButtonsIn(scope) : []
}
const cardVisibility = (): boolean[] => {
  const scope = scopeOf()
  return scope ? filterCardsIn(scope).map((card) => !card.hidden) : []
}
const pressedState = (): boolean[] =>
  buttonsOf().map((button) => button.getAttribute('aria-pressed') === 'true')

describe('card grid: palette, panel, export and visitor flow', () => {
  it('builds a filtered grid from the palette and drives it like a visitor', () => {
    // Start from an empty page; the palette is the only source of blocks.
    const empty: SiteConfig = {
      name: 'Editor',
      pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [] }],
      blocks: [],
    }
    useConfigStore.getState().setConfig(empty)

    // 1. Insert the block from the palette.
    const sidebar = mountReact(createElement(LeftSidebar))
    const componentsTab = Array.from(sidebar.querySelectorAll('button')).find(
      (button) => (button.textContent ?? '').trim() === 'Components',
    )!
    act(() => componentsTab.click())
    const paletteEntry = Array.from(sidebar.querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').trim().startsWith('Card Grid'),
    )!
    act(() => paletteEntry.click())

    expect(storedBlocks()).toHaveLength(1)
    expect(storedBlocks()[0].props.items).toEqual([])
    act(() => sidebar.remove())

    // 2. Fill three items through the panel: two categories and one uncategorised.
    const blockId = storedBlocks()[0].id
    function EditorHarness() {
      const block = useConfigStore((state) =>
        state.config.pages![0].blocks.find((candidate) => candidate.id === blockId),
      )
      return createElement(
        Fragment,
        null,
        createElement(PropertiesPanel, { block: block! }),
        createElement('div', { 'data-testid': 'preview' }, createElement(RenderBlock, { block: block! })),
      )
    }
    const container = mountReact(createElement(EditorHarness))

    const addItem = (): void => {
      const button = Array.from(field(container, 'Products').querySelectorAll('button')).find(
        (candidate) => (candidate.textContent ?? '').includes('Add item'),
      )!
      act(() => button.click())
    }
    addItem()
    addItem()
    addItem()
    expect(itemCards(container)).toHaveLength(3)

    setText(container, 0, 'Name', 'Runner')
    setText(container, 0, 'Category', 'Shoes')
    setText(container, 1, 'Name', 'Cap')
    setText(container, 1, 'Category', 'Hats')
    setText(container, 2, 'Name', 'Gift card')

    // 3. Switch the display option on through the panel.
    choose(container, 'Display', 'filter')
    const stored = storedBlocks()[0]
    expect(stored.props.display).toBe('filter')
    const items = stored.props.items as Array<Record<string, unknown>>
    expect(items.map((item) => item.name)).toEqual(['Runner', 'Cap', 'Gift card'])
    expect(items.map((item) => item.category)).toEqual(['Shoes', 'Hats', ''])

    // The preview of the same block shows all three cards and no filter control.
    const preview = container.querySelector<HTMLElement>('[data-testid="preview"]')!
    expect(preview.querySelectorAll('article')).toHaveLength(3)
    expect(preview.textContent).toContain('Gift card')
    expect(preview.querySelector('[data-sb-filter]')).toBeNull()
    expect(preview.querySelectorAll('button')).toHaveLength(0)

    // 4. Export with the real exporter and mount it with its runtime.
    const html = exportSiteToHTML(useConfigStore.getState().config)
    const page = parse(html)
    expect(page.querySelectorAll('script[data-sb-runtime]')).toHaveLength(1)
    expect(page.querySelector('noscript style')?.textContent).toContain(
      '[data-sb-filter-btn]{display:none!important}',
    )
    page.querySelector('script[data-sb-runtime]')?.remove()
    ;(window as unknown as { matchMedia: (query: string) => MediaQueryList }).matchMedia = () =>
      mediaQuery(false)
    const editorPreview = container.querySelector('[data-testid="preview"]')!
    const editorClone = editorPreview.cloneNode(true) as HTMLElement
    document.body.innerHTML = page.body.innerHTML

    expect(buttonsOf().map((button) => (button.textContent ?? '').trim())).toEqual([
      'All',
      'Shoes',
      'Hats',
    ])
    expect(pressedState()).toEqual([true, false, false])
    expect(cardVisibility()).toEqual([true, true, true])

    // 5. A category click hides the other cards.
    click(buttonsOf()[1])
    expect(pressedState()).toEqual([false, true, false])
    expect(cardVisibility()).toEqual([true, false, false])

    // 6. A keyboard activation on another category applies that filter.
    buttonsOf()[2].focus()
    expect(document.activeElement).toBe(buttonsOf()[2])
    press('Enter')
    expect(pressedState()).toEqual([false, false, true])
    expect(cardVisibility()).toEqual([false, true, false])

    // 7. "All" restores every card, the uncategorised one included.
    click(buttonsOf()[0])
    expect(pressedState()).toEqual([true, false, false])
    expect(cardVisibility()).toEqual([true, true, true])

    // 8. The editor preview placed beside the exported page shows every card and
    //    no filter control, in the same document.
    const host = document.createElement('div')
    host.appendChild(editorClone)
    document.body.appendChild(host)
    expect(host.querySelectorAll('article')).toHaveLength(3)
    expect(host.textContent).toContain('Runner')
    expect(host.textContent).toContain('Cap')
    expect(host.textContent).toContain('Gift card')
    expect(host.querySelector('[data-sb-filter],[data-sb-filter-btn],[data-sb-category]')).toBeNull()
  })
})
