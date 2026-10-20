/**
 * Editor-user flows on the tabs option, export/editor parity, no-script markup
 * and the runtime-path guarantees.
 *
 * The editor side renders the real properties panel and preview from the config
 * store, so a panel write is observed through the same re-render the editor
 * performs. The exported side is built with the real exporter and its inline
 * runtime is started once for the whole file with `new Function` (jsdom does not
 * run scripts assigned through `innerHTML`).
 *
 * The shared behavior table (`tests/helpers/behavior-test-table.ts`) supplies
 * the menu, faq and tab rows replayed through both adapters here. Rows that
 * compare against the frozen 0.4.0 export load their inputs through the baseline
 * helper, so the document compared is the one the fixture was captured from.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { act, createElement, Fragment } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { exportSiteToHTML } from '../../src/lib/export-html'
import { BEHAVIOR_RUNTIME_SOURCE } from '../../src/lib/export-behavior-runtime'
import { validateSiteConfig } from '../../src/lib/generate-site'
import { RenderBlock } from '../../src/blocks/registry'
import { PropertiesPanel } from '../../src/editor/PropertiesPanel'
import { useConfigStore } from '../../src/store/configStore'
import {
  BEHAVIOR_CASES,
  FIXTURE_BLOCKS,
  runCase,
  type BehaviorAdapter,
} from '../helpers/behavior-test-table'
import { tabLists, tabsIn } from '../helpers/behavior-test-table-tabs'
import { findSite, fixtureHtml, render } from '../helpers/export-baseline-0.4.0-inputs'
import { ensureFreshBuild } from '../helpers/ensure-fresh-build'
import type { BlockConfig, SiteConfig } from '../../src/blocks/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SITE = 'Site'

/**
 * The no-script tab rules, pinned as a literal. Importing the exporter's
 * constant would move with the emitter and prove nothing about the page.
 */
const TAB_RULES =
  '[data-sb-tablist]{display:none!important}\n[data-sb-tab-panel],[data-sb-tab-title]{display:block!important}'

const site = (blocks: BlockConfig[], name = SITE): SiteConfig => ({ name, blocks })

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

/** Reset the document and the media-query stub before a flow starts. */
function mount(page: Document): void {
  ;(window as unknown as { matchMedia?: unknown }).matchMedia = undefined
  // The runtime is already running from `beforeAll`; keeping the tag would
  // leave an inert copy in the document under test.
  page.querySelector('script[data-sb-runtime]')?.remove()
  document.body.innerHTML = page.body.innerHTML
}

const click = (element: Element): void => {
  ;(element as HTMLElement).click()
}

/** Dispatch a keydown on whatever currently owns focus, as a visitor would. */
const press = (key: string): void => {
  const target = document.activeElement ?? document.body
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

const panelOf = (tab: Element): HTMLElement | null =>
  document.getElementById(tab.getAttribute('aria-controls') ?? '')

const selected = (tabs: Element[]): boolean[] =>
  tabs.map((tab) => tab.getAttribute('aria-selected') === 'true')

const visible = (tabs: Element[]): boolean[] =>
  tabs.map((tab) => {
    const panel = panelOf(tab)
    return !!panel && !panel.hidden
  })

const count = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1

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

// ---------------------------------------------------------------------------
// Editor harness: the properties panel and the preview both read the store.
// ---------------------------------------------------------------------------

const roots: Root[] = []

function trackRoot(container: HTMLElement): Root {
  const root = createRoot(container)
  roots.push(root)
  return root
}

function activeBlocks(): BlockConfig[] {
  const state = useConfigStore.getState()
  const page = state.config.pages?.find((candidate) => candidate.id === state.activePageId)
  return page?.blocks ?? []
}

function storedBlock(id: string): BlockConfig {
  const block = activeBlocks().find((candidate) => candidate.id === id)
  if (!block) throw new Error(`no stored block "${id}"`)
  return block
}

function seed(config: SiteConfig): void {
  useConfigStore.getState().setConfig(config)
}

function EditorHarness({ blockId }: { blockId: string }) {
  const block = useConfigStore((state) => {
    const page = state.config.pages?.find((candidate) => candidate.id === state.activePageId)
    return page?.blocks.find((candidate) => candidate.id === blockId)
  })
  if (!block) return null
  return createElement(
    Fragment,
    null,
    createElement(PropertiesPanel, { block }),
    createElement(
      'div',
      { 'data-testid': 'preview' },
      createElement(RenderBlock, { block }),
    ),
  )
}

function renderEditor(blockId: string): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = trackRoot(container)
  act(() => root.render(createElement(EditorHarness, { blockId })))
  return container
}

const preview = (container: HTMLElement): HTMLElement => {
  const node = container.querySelector<HTMLElement>('[data-testid="preview"]')
  if (!node) throw new Error('no preview node')
  return node
}

function displaySelect(container: HTMLElement): HTMLSelectElement {
  const label = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.trim() === 'Display',
  )
  const select = label?.parentElement?.querySelector('select')
  if (!select) throw new Error('no Display select in the panel')
  return select as HTMLSelectElement
}

function choose(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
  act(() => {
    setter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

let editorRoot: Root | undefined
let editorHost: HTMLElement | undefined

function unmountEditor(): void {
  if (editorRoot) act(() => editorRoot!.unmount())
  editorRoot = undefined
  editorHost?.remove()
  editorHost = undefined
}

const editorAdapter: BehaviorAdapter = {
  mount(fixture) {
    unmountEditor()
    // The previous run may have left an exported page in the shared body.
    document.body.innerHTML = ''
    ;(window as unknown as { matchMedia?: unknown }).matchMedia = undefined
    editorHost = document.createElement('div')
    document.body.appendChild(editorHost)
    editorRoot = createRoot(editorHost)
    // Index keys: a fixture may deliberately repeat a block id.
    const children = FIXTURE_BLOCKS[fixture].map((block, index) =>
      createElement(RenderBlock, { key: index, block }),
    )
    act(() => editorRoot!.render(createElement(Fragment, null, children)))
  },
  menuButtons: () =>
    Array.from(
      document.querySelectorAll<HTMLButtonElement>('nav button[aria-label="Toggle menu"]'),
    ),
  faqButtons: () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('section button[aria-expanded]')),
  click(element) {
    act(() => (element as HTMLElement).click())
  },
  key(element, key) {
    act(() => {
      element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    })
  },
  setReducedMotion(on) {
    ;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = () =>
      mediaQuery(on)
  },
}

const exportAdapter: BehaviorAdapter = {
  mount(fixture) {
    unmountEditor()
    mount(parse(exportSiteToHTML(site(FIXTURE_BLOCKS[fixture]))))
  },
  menuButtons: () =>
    Array.from(
      document.querySelectorAll<HTMLButtonElement>('button[data-sb-menu-toggle]'),
    ),
  faqButtons: () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('section button[aria-expanded]')),
  click(element) {
    ;(element as HTMLElement).click()
  },
  key(element, key) {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  },
  setReducedMotion(on) {
    ;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = () =>
      mediaQuery(on)
  },
}

let runtime = ''

beforeAll(() => {
  runtime =
    parse(exportSiteToHTML(site(FIXTURE_BLOCKS.tabs)))
      .querySelector('script[data-sb-runtime]')
      ?.textContent ?? ''
  expect(runtime).not.toBe('')
  new Function(runtime)()
})

afterEach(() => {
  unmountEditor()
  for (const root of roots) act(() => root.unmount())
  roots.length = 0
  document.body.innerHTML = ''
  ;(window as unknown as { matchMedia?: unknown }).matchMedia = undefined
})

describe('tabs option: editor parity and no-script guarantees', () => {
  it('turns the tab layout on from the properties panel and exports it', () => {
    const block: BlockConfig = {
      id: 'feat-1',
      type: 'features',
      variant: 'grid',
      props: {
        title: 'Capabilities',
        items: [
          { title: 'One', description: 'One description.' },
          { title: 'Two', description: 'Two description.' },
          { title: 'Three', description: 'Three description.' },
        ],
      },
    }
    seed({ name: 'Editor', pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [block] }], blocks: [block] })
    const container = renderEditor('feat-1')
    expect(preview(container).querySelector('[role="tablist"]')).toBeNull()

    choose(displaySelect(container), 'tabs')

    expect(storedBlock('feat-1').props.display).toBe('tabs')
    const previewTabs = Array.from(
      preview(container).querySelectorAll<HTMLElement>('[role="tab"]'),
    )
    expect(previewTabs.map((tab) => tab.textContent?.trim())).toEqual(['One', 'Two', 'Three'])

    const exported = parse(exportSiteToHTML(useConfigStore.getState().config))
    expect(exported.querySelectorAll('[role="tablist"]')).toHaveLength(1)
    expect(exported.querySelectorAll('[data-sb-tab]')).toHaveLength(3)
    expect(exported.querySelectorAll('[role="tabpanel"]')).toHaveLength(3)
    expect(exported.querySelectorAll('[data-sb-tab]')[1].textContent?.trim()).toBe('Two')
  })

  it('gives the editor and the export identical outcomes for every shared row', () => {
    expect(BEHAVIOR_CASES.length).toBeGreaterThan(0)
    // The loop can only catch a behavior whose rows reached the table.
    expect(BEHAVIOR_CASES.some((behaviorCase) => behaviorCase.behavior === 'tabs')).toBe(true)

    const rows = BEHAVIOR_CASES.map((behaviorCase) => {
      const run = (side: 'editor' | 'exported'): Record<string, unknown> => {
        try {
          return runCase(side === 'editor' ? editorAdapter : exportAdapter, behaviorCase)
        } catch (error) {
          throw new Error(`${behaviorCase.id} (${side}): ${(error as Error).message}`)
        }
      }
      return { behaviorCase, editor: run('editor'), exported: run('exported') }
    })

    for (const row of rows) {
      // `runCase` observes exactly the keys the row declares, so both sides are
      // compared against the same concrete expectation as well as each other.
      expect(row.exported, row.behaviorCase.id).toEqual(row.editor)
      expect(row.exported, row.behaviorCase.id).toEqual(row.behaviorCase.expect)
    }

    // Non-vacuity: the table really observed open and closed menu/faq states,
    // and tab selections on one set and on two sets.
    const menuStates = rows.flatMap(
      (row) => ((row.exported.menus as Array<{ open: boolean }> | undefined) ?? []).map((m) => m.open),
    )
    expect(menuStates).toContain(true)
    expect(menuStates).toContain(false)
    const faqStates = rows.flatMap((row) => (row.exported.faq as boolean[] | undefined) ?? [])
    expect(faqStates).toContain(true)
    expect(faqStates).toContain(false)
    const tabViews = rows.flatMap(
      (row) => (row.exported.tabs as Array<{ selected: boolean[] }> | undefined) ?? [],
    )
    expect(tabViews.length).toBeGreaterThan(0)
    expect(tabViews.some((view) => view.selected.includes(true))).toBe(true)
    expect(tabViews.some((view) => view.selected.includes(false))).toBe(true)
    expect(tabViews.some((view) => view.selected.length >= 2)).toBe(true)
  })

  it('clamps the preview selection when items shrink and falls back at one', () => {
    const block = FIXTURE_BLOCKS.tabs[0]
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = trackRoot(host)
    const show = (next: BlockConfig): void => {
      act(() =>
        root.render(
          createElement(Fragment, null, createElement(RenderBlock, { key: 0, block: next })),
        ),
      )
    }
    const tabs = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'))

    show(block)
    expect(tabs()).toHaveLength(3)
    act(() => tabs()[2].click())
    expect(selected(tabs())).toEqual([false, false, true])

    const items = block.props.items as unknown[]
    const shrink = (length: number): BlockConfig => ({
      ...block,
      props: { ...block.props, items: items.slice(0, length) },
    })

    show(shrink(2))
    expect(tabs()).toHaveLength(2)
    expect(selected(tabs())).toEqual([false, true])
    const panels = Array.from(document.querySelectorAll<HTMLElement>('[role="tabpanel"]'))
    expect(panels.map((panel) => panel.hidden)).toEqual([true, false])

    show(shrink(1))
    expect(document.querySelector('[role="tablist"]')).toBeNull()
    expect(document.querySelector('[role="tabpanel"]')).toBeNull()
    expect(document.body.textContent).toContain('First feature')
  })

  it('emits per-panel markup and the tab rules only on pages with a tab set', () => {
    const page = parse(exportSiteToHTML(site(FIXTURE_BLOCKS.tabs)))
    const panels = Array.from(page.querySelectorAll<HTMLElement>('[data-sb-tab-panel]'))
    const tabs = Array.from(page.querySelectorAll<HTMLElement>('[role="tab"]'))

    expect(panels).toHaveLength(3)
    expect(tabs).toHaveLength(3)
    panels.forEach((panel, index) => {
      const heading = panel.querySelector('[data-sb-tab-title]')
      expect(heading, `panel ${index} has no title heading`).not.toBeNull()
      expect(heading!.tagName).toBe('H3')
      expect(heading!.textContent).toBe(tabs[index].textContent)
    })
    expect(page.querySelector('noscript style')?.textContent).toBe(TAB_RULES)

    // A page without tabs holds no tab markup and no tab rule.
    const plain = render(findSite('features-no-display'))
    expect(plain).not.toContain('<noscript>')
    expect(plain).not.toContain('data-sb-tab-panel')
    expect(plain).not.toContain('[data-sb-tablist]')

    // A page with another behavior keeps its own rules and no tab rule. The
    // check reads the no-script stylesheet, not the whole document: the shared
    // runtime source always mentions the tab hooks even when no tab set exists.
    const menuAndFaq = parse(exportSiteToHTML(site(FIXTURE_BLOCKS['navbar-and-faq'])))
    const menuAndFaqCss = menuAndFaq.querySelector('noscript style')?.textContent ?? ''
    expect(menuAndFaqCss).toContain('[data-sb-menu-toggle]')
    expect(menuAndFaqCss).toContain('.faq-content')
    expect(menuAndFaqCss).not.toContain('[data-sb-tablist]')
    expect(menuAndFaqCss).not.toContain('[data-sb-tab-panel]')
  })

  it('renders RTL and emoji labels literally and still moves with keys', () => {
    const items = [
      { title: 'الميزة الأولى', description: 'وصف عربي كامل' },
      { title: '🚀 Rocket', description: 'Emoji description' },
      { title: 'Ünïcode ✓', description: 'Accented description' },
    ]
    const block: BlockConfig = {
      id: 'feat-unicode',
      type: 'features',
      variant: 'grid',
      props: { title: 'Unicode', display: 'tabs', items },
    }
    mount(parse(exportSiteToHTML(site([block]))))
    const tabs = tabsIn(tabLists()[0])
    const labels = items.map((item) => item.title)

    expect(tabs.map((tab) => (tab.textContent ?? '').trim())).toEqual(labels)

    tabs[0].focus()
    press('ArrowRight')
    expect(selected(tabs)).toEqual([false, true, false])
    expect(document.activeElement).toBe(tabs[1])
    press('End')
    expect(selected(tabs)).toEqual([false, false, true])
    expect(document.activeElement).toBe(tabs[2])
    press('Home')
    expect(selected(tabs)).toEqual([true, false, false])
    expect(document.activeElement).toBe(tabs[0])
    press('ArrowLeft')
    expect(selected(tabs)).toEqual([false, false, true])
    // The labels survive every interaction unchanged.
    expect(tabs.map((tab) => (tab.textContent ?? '').trim())).toEqual(labels)
  })

  it('shows the default layout for an unknown stored value and leaves it stored', () => {
    const block: BlockConfig = {
      id: 'feat-1',
      type: 'features',
      variant: 'grid',
      props: {
        title: 'Capabilities',
        display: 'carousel',
        items: [
          { title: 'One', description: 'One description.' },
          { title: 'Two', description: 'Two description.' },
        ],
      },
    }
    seed({ name: 'Editor', pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [block] }], blocks: [block] })
    const container = renderEditor('feat-1')
    const select = displaySelect(container)

    // An unmatched stored value cannot select a wrong option: the control falls
    // back to the first option, which is the default layout.
    expect(select.value).toBe('')
    expect(select.selectedOptions[0]?.textContent).toBe('Default layout')
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['', 'tabs'])
    expect(storedBlock('feat-1').props.display).toBe('carousel')

    // Both the preview and the export take the default layout path.
    expect(preview(container).querySelector('[role="tablist"]')).toBeNull()
    expect(preview(container).textContent).toContain('One description.')
    const exported = exportSiteToHTML(useConfigStore.getState().config)
    expect(exported).not.toContain('role="tablist"')
    expect(exported).not.toContain('data-sb-runtime')
    expect(exported).toContain('xl:grid-cols-3')
  })

  it('removes the option when the default layout is chosen again', () => {
    const base = findSite('features-no-display')
    const config = JSON.parse(JSON.stringify(base.config)) as SiteConfig
    const features = (config.blocks ?? []).find((candidate) => candidate.type === 'features')!
    features.props = { ...features.props, display: 'tabs' }
    seed(config)

    const container = renderEditor(features.id)
    expect(preview(container).querySelector('[role="tablist"]')).not.toBeNull()

    choose(displaySelect(container), '')

    expect('display' in storedBlock(features.id).props).toBe(false)
    expect(storedBlock(features.id).props.title).toBe('Features')
    expect(preview(container).querySelector('[role="tablist"]')).toBeNull()

    // The same site without the option exports exactly its 0.4.0 capture.
    expect(exportSiteToHTML(useConfigStore.getState().config)).toBe(
      fixtureHtml('features-no-display.html'),
    )
  })

  it('keeps a flattened generated display option through validation and export', () => {
    const generated = {
      name: 'Generated',
      blocks: [
        {
          id: 'gen-tabs',
          type: 'features',
          variant: 'grid',
          title: 'Capabilities',
          display: 'tabs',
          items: [
            { icon: 'A', title: 'One', description: 'One description.' },
            { icon: 'B', title: 'Two', description: 'Two description.' },
            { icon: 'C', title: 'Three', description: 'Three description.' },
          ],
        },
      ],
    }

    const config = validateSiteConfig(generated)
    const block = config.blocks![0]
    expect(block.props.display).toBe('tabs')
    expect(block.props.title).toBe('Capabilities')
    expect(block.props.items as unknown[]).toHaveLength(3)

    const html = exportSiteToHTML(config)
    const page = parse(html)
    expect(page.querySelectorAll('[role="tablist"]')).toHaveLength(1)
    expect(page.querySelectorAll('[data-sb-tab]')).toHaveLength(3)
    expect(page.querySelectorAll('[role="tabpanel"]')).toHaveLength(3)
    expect(count(html, '<script data-sb-runtime>')).toBe(1)
  })

  it('renders the same tab page through the built worker entry', async () => {
    ensureFreshBuild()
    const worker = (await import(
      /* @vite-ignore */ pathToFileURL(
        resolve(import.meta.dirname, '..', '..', 'dist', 'worker.js'),
      ).href
    )) as {
      exportSitePages: (config: SiteConfig) => Array<{ path: string; html: string }>
    }

    const config = site(FIXTURE_BLOCKS.tabs, 'Worker')
    const docs = worker.exportSitePages(config)
    expect(docs).toHaveLength(1)
    expect(docs[0].path).toBe('/')
    expect(docs[0].html).toBe(exportSiteToHTML(config))

    const emitted = /<script data-sb-runtime>([\s\S]*?)<\/script>/.exec(docs[0].html)?.[1] ?? ''
    expect(emitted).toBe(BEHAVIOR_RUNTIME_SOURCE)
    expect(gzipSync(Buffer.from(emitted, 'utf8')).length).toBeLessThanOrEqual(2048)
  }, 300_000)

  it('keeps the editor preview and the exported page independent in one document', () => {
    mount(parse(exportSiteToHTML(site(FIXTURE_BLOCKS.tabs))))
    const exportedTabs = tabsIn(tabLists()[0])
    const exportedBefore = selected(exportedTabs)
    expect(exportedBefore).toEqual([true, false, false])

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = trackRoot(host)
    act(() => root.render(createElement(RenderBlock, { block: FIXTURE_BLOCKS.tabs[0] })))

    // The editor markup carries no runtime hook, so the export runtime ignores it.
    expect(host.querySelectorAll('[data-sb-tab],[data-sb-tablist],[data-sb-tab-panel]')).toHaveLength(0)
    const editorTabs = Array.from(host.querySelectorAll<HTMLElement>('[role="tab"]'))
    expect(editorTabs).toHaveLength(3)
    const exportedIds = exportedTabs.map((tab) => tab.id)
    expect(editorTabs.every((tab) => tab.id.length > 0)).toBe(true)
    expect(editorTabs.some((tab) => exportedIds.includes(tab.id))).toBe(false)

    // Clicking and arrowing in the editor changes only React state.
    act(() => editorTabs[2].click())
    expect(selected(editorTabs)).toEqual([false, false, true])
    expect(selected(exportedTabs)).toEqual(exportedBefore)
    expect(visible(exportedTabs)).toEqual([true, false, false])

    act(() => {
      editorTabs[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(selected(editorTabs)).toEqual([true, false, false])
    expect(document.activeElement).toBe(editorTabs[0])
    expect(selected(exportedTabs)).toEqual(exportedBefore)
    expect(visible(exportedTabs)).toEqual([true, false, false])
  })
})
