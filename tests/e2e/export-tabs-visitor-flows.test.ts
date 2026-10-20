/**
 * Visitor flows on an exported page that carries one or more tab sets.
 *
 * Every page is built with the real exporter, parsed into the test document and
 * the single inline runtime is started once for the whole file. jsdom does not
 * run scripts assigned through `innerHTML`, so the runtime text is evaluated
 * explicitly with `new Function` — the same bytes a browser would run.
 *
 * The fixture blocks live in `tests/helpers/behavior-fixtures.ts`; the shared
 * table's tab queries (`tabLists` / `tabsIn`) are reused so this suite and the
 * behavior-table suites observe the same ARIA contract. Rows that compare
 * against the frozen 0.4.0 export load their inputs through the baseline helper,
 * so the document compared is the one the fixture was captured from.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { exportSiteToHTML } from '../../src/lib/export-html'
import { exportSitePages } from '../../src/lib/export-site-pages'
import { FIXTURE_BLOCKS } from '../helpers/behavior-test-table'
import { tabLists, tabsIn } from '../helpers/behavior-test-table-tabs'
import { findSite, fixtureHtml, render } from '../helpers/export-baseline-0.4.0-inputs'
import type { BlockConfig, SiteConfig } from '../../src/blocks/types'

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

/** A panel counts as visible only when it resolves and carries no `hidden`. */
const visible = (tabs: Element[]): boolean[] =>
  tabs.map((tab) => {
    const panel = panelOf(tab)
    return !!panel && !panel.hidden
  })

const tabStops = (tabs: HTMLElement[]): boolean[] => tabs.map((tab) => tab.tabIndex >= 0)

const labelOf = (tab: Element): string => (tab.textContent ?? '').trim()

const count = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1

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
  document.body.innerHTML = ''
  ;(window as unknown as { matchMedia?: unknown }).matchMedia = undefined
})

describe('exported tab-set visitor flows', () => {
  it('selects a tab by tapping and shows only its panel', () => {
    mount(parse(exportSiteToHTML(site(FIXTURE_BLOCKS.tabs))))
    const tabs = tabsIn(tabLists()[0])
    expect(tabs).toHaveLength(3)
    expect(selected(tabs)).toEqual([true, false, false])

    click(tabs[1])

    expect(selected(tabs)).toEqual([false, true, false])
    expect(visible(tabs)).toEqual([false, true, false])
    const panel = panelOf(tabs[1])
    expect(panel?.querySelector('p')?.textContent).toBe('Second description.')
    expect(panelOf(tabs[0])?.querySelector('p')?.textContent).not.toBe(
      'Second description.',
    )
  })

  it('moves through tabs with ArrowRight and keeps one tab stop', () => {
    mount(parse(exportSiteToHTML(site(FIXTURE_BLOCKS.tabs))))
    const tabs = tabsIn(tabLists()[0])

    tabs[0].focus()
    press('ArrowRight')
    press('ArrowRight')

    expect(selected(tabs)).toEqual([false, false, true])
    expect(visible(tabs)).toEqual([false, false, true])
    expect(tabStops(tabs)).toEqual([false, false, true])
    expect(document.activeElement).toBe(tabs[2])
  })

  it('jumps with End and Home from a focused middle tab', () => {
    mount(parse(exportSiteToHTML(site(FIXTURE_BLOCKS.tabs))))
    const tabs = tabsIn(tabLists()[0])

    tabs[1].focus()
    press('End')

    expect(selected(tabs)).toEqual([false, false, true])
    expect(document.activeElement).toBe(tabs[2])

    press('Home')

    expect(selected(tabs)).toEqual([true, false, false])
    expect(visible(tabs)).toEqual([true, false, false])
    expect(document.activeElement).toBe(tabs[0])
  })

  it('wraps the selection at both ends', () => {
    mount(parse(exportSiteToHTML(site(FIXTURE_BLOCKS.tabs))))
    const tabs = tabsIn(tabLists()[0])

    tabs[2].focus()
    press('ArrowRight')

    expect(selected(tabs)).toEqual([true, false, false])
    expect(document.activeElement).toBe(tabs[0])

    press('ArrowLeft')

    expect(selected(tabs)).toEqual([false, false, true])
    expect(visible(tabs)).toEqual([false, false, true])
    expect(document.activeElement).toBe(tabs[2])
  })

  it('keeps two sets sharing a block id independent of a third set', () => {
    const [sharedFirst, sharedSecond] = FIXTURE_BLOCKS['tab-sets-shared-id']
    const third: BlockConfig = {
      id: 'feat-2',
      type: 'features',
      variant: 'list',
      props: {
        title: 'Third set',
        display: 'tabs',
        items: [
          { icon: 'A', title: 'Third A', description: 'Third A description.' },
          { icon: 'B', title: 'Third B', description: 'Third B description.' },
          { icon: 'C', title: 'Third C', description: 'Third C description.' },
        ],
      },
    }
    mount(parse(exportSiteToHTML(site([sharedFirst, sharedSecond, third]))))
    // Three sets on one page still get exactly one runtime script.
    expect(count(exportSiteToHTML(site([sharedFirst, sharedSecond, third])), '<script data-sb-runtime>')).toBe(1)

    const lists = tabLists()
    expect(lists).toHaveLength(3)
    const sets = lists.map((list) => tabsIn(list))

    click(sets[0][2])
    expect(selected(sets[0])).toEqual([false, false, true])
    expect(selected(sets[1])).toEqual([true, false, false])
    expect(selected(sets[2])).toEqual([true, false, false])

    sets[1][0].focus()
    press('End')
    expect(selected(sets[1])).toEqual([false, false, true])
    expect(selected(sets[0])).toEqual([false, false, true])
    expect(selected(sets[2])).toEqual([true, false, false])

    click(sets[2][1])
    expect(selected(sets[2])).toEqual([false, true, false])
    expect(selected(sets[0])).toEqual([false, false, true])
    expect(selected(sets[1])).toEqual([false, false, true])

    // Every tab and panel id is present and unique across all three sets.
    const ids = Array.from(
      document.querySelectorAll<HTMLElement>('[role="tab"],[role="tabpanel"]'),
    ).map((element) => element.id)
    expect(ids).toHaveLength(18)
    expect(ids.every((id) => id.length > 0)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)

    // The anchor id is claimed once: the first block only, never the twin.
    expect(document.querySelectorAll('[id="feat-1"]')).toHaveLength(1)
    const sectionIds = Array.from(document.querySelectorAll('section'))
      .map((section) => section.id)
      .filter((id) => id.length > 0)
    expect(sectionIds).toEqual(['feat-1', 'feat-2'])
  })

  it('renders one item as the default layout, byte-identical to 0.4.0', () => {
    const html = render(findSite('features-tabs-one-item'))

    expect(html).toBe(fixtureHtml('features-tabs-one-item.html'))
    expect(html).not.toContain('role="tablist"')
    expect(html).not.toContain('data-sb-runtime')
    expect(html).not.toContain('<noscript>')
    // The default renderer really ran: the item is a grid card.
    expect(html).toContain('Only feature')
    expect(html).toContain('xl:grid-cols-3')
  })

  it('renders every hostile display value as the default layout', () => {
    const html = render(findSite('features-hostile-display'))

    expect(html).toBe(fixtureHtml('features-hostile-display.html'))
    expect(html).not.toContain('role="tablist"')
    expect(html).not.toContain('data-sb-runtime')
    expect(html).not.toContain('<noscript>')
    // Seven blocks, seven default grid layouts, and the injection-shaped value
    // never reaches the bytes as markup.
    expect(count(html, 'xl:grid-cols-3')).toBe(7)
    expect(html).not.toContain('<script>alert(1)</script>')
  })

  it('shows hostile and very long labels literally and still responds to keys', () => {
    const markupText = '<img src=x onerror=alert(1)>'
    const quotedText = 'He said "hi" & left'
    const longText = 'L'.repeat(10_000)
    const block: BlockConfig = {
      id: 'feat-hostile',
      type: 'features',
      variant: 'grid',
      props: {
        title: 'Hostile',
        display: 'tabs',
        items: [
          { title: markupText, description: markupText },
          { title: quotedText, description: quotedText },
          { title: longText, description: longText },
        ],
      },
    }
    const html = exportSiteToHTML(site([block]))
    expect(html).not.toContain('<img src=x')

    mount(parse(html))
    const tabs = tabsIn(tabLists()[0])
    expect(tabs.map(labelOf)).toEqual([markupText, quotedText, longText])
    expect(tabs.map((tab) => panelOf(tab)?.querySelector('p')?.textContent)).toEqual([
      markupText,
      quotedText,
      longText,
    ])
    expect(tabs.map((tab) => panelOf(tab)?.querySelector('h3')?.textContent)).toEqual([
      markupText,
      quotedText,
      longText,
    ])

    // Nothing the text contained became an element or an event handler.
    expect(document.body.querySelector('img')).toBeNull()
    const onAttributes = Array.from(document.body.querySelectorAll('*')).flatMap((element) =>
      Array.from(element.attributes)
        .map((attribute) => attribute.name)
        .filter((name) => name.startsWith('on')),
    )
    expect(onAttributes).toEqual([])

    tabs[0].focus()
    press('ArrowRight')
    expect(selected(tabs)).toEqual([false, true, false])
    expect(document.activeElement).toBe(tabs[1])
    press('ArrowRight')
    expect(selected(tabs)).toEqual([false, false, true])
    expect(document.activeElement).toBe(tabs[2])
  })

  it('runs navbar, faq and tabs together without cross-talk', () => {
    const blocks = [...FIXTURE_BLOCKS['navbar-and-faq'], ...FIXTURE_BLOCKS.tabs]
    const html = exportSiteToHTML(site(blocks))
    expect(count(html, '<script data-sb-runtime>')).toBe(1)
    expect(html).toContain(TAB_RULES)
    expect(html).toContain('[data-sb-menu-toggle]')
    expect(html).toContain('.faq-content')

    mount(parse(html))
    const menu = document.querySelector<HTMLButtonElement>('button[data-sb-menu-toggle]')!
    const faq = Array.from(
      document.querySelectorAll<HTMLButtonElement>('section button[aria-expanded]'),
    )
    const tabs = tabsIn(tabLists()[0])

    click(menu)
    expect(menu.getAttribute('aria-expanded')).toBe('true')
    click(faq[1])
    expect(faq.map((button) => button.getAttribute('aria-expanded'))).toEqual([
      'false',
      'true',
      'false',
    ])

    click(tabs[1])
    expect(selected(tabs)).toEqual([false, true, false])
    tabs[1].focus()
    press('ArrowRight')
    expect(selected(tabs)).toEqual([false, false, true])

    // The tab keys changed nothing about the two older widgets.
    expect(menu.getAttribute('aria-expanded')).toBe('true')
    expect(faq.map((button) => button.getAttribute('aria-expanded'))).toEqual([
      'false',
      'true',
      'false',
    ])
  })

  it('puts the script and tab rules only on the page with the tab set', () => {
    const entry = findSite('two-page-tabs')
    const pages = exportSitePages(entry.config, entry.options ?? undefined)

    expect(pages.map((page) => page.path)).toEqual(['/', '/plain'])
    expect(pages).toHaveLength(2)

    // Page 2 is exactly its frozen 0.4.0 capture.
    expect(pages[1].html).toBe(fixtureHtml('two-page-tabs--2.html'))
    expect(pages[1].html).not.toContain('data-sb-runtime')
    expect(pages[1].html).not.toContain('sb_tabs_')
    expect(pages[1].html).not.toContain('<noscript>')

    // Page 1 carries one script, the tab rules, and the first set id.
    expect(count(pages[0].html, '<script data-sb-runtime>')).toBe(1)
    expect(pages[0].html).toContain('id="sb_tabs_1_t1"')
    expect(pages[0].html).not.toContain('sb_tabs_2_')
    const pageOne = parse(pages[0].html)
    expect(pageOne.querySelector('noscript style')?.textContent).toBe(TAB_RULES)
    expect(pageOne.querySelectorAll('[role="tablist"]')).toHaveLength(1)
    expect(pageOne.querySelectorAll('[role="tabpanel"]')).toHaveLength(3)
  })
})
