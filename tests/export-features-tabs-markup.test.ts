/**
 * SC-001 / FR-001 / FR-002 / FR-003 — the exported tab-set markup.
 *
 * This suite is about the markup CONTRACT, not the runtime: one tab list, one
 * button per item, one panel per item, a unique reference in both directions,
 * exactly one tab stop, and ids whose charset is safe to embed in an attribute.
 * The interactions themselves are proven against this markup by the behavior
 * table suites.
 *
 * Every assertion here reads the exported document rather than a hand-built
 * fragment, so a divergence between the renderer and the runtime cannot pass.
 */
import { describe, it, expect } from 'vitest'
import { exportSiteToHTML } from '../src/lib/export-html'
import { exportSitePages } from '../src/lib/export-site-pages'
import { TAB_ID_PREFIX } from '../src/lib/export-behavior-runtime'
import type { BlockConfig, SiteConfig } from '../src/blocks/types'

const ID_CHARSET_RE = /^[A-Za-z0-9_-]+$/
const TAB_ID_RE = /^sb_tabs_\d+_t\d+$/
const PANEL_ID_RE = /^sb_tabs_\d+_p\d+$/

function item(title: string, description: string) {
  return { icon: 'A', title, description }
}

function site(blocks: BlockConfig[], config?: Partial<SiteConfig>): SiteConfig {
  return { name: 'Site', blocks, ...config } as SiteConfig
}

function tabsBlock(props: Record<string, unknown>, id = 'f-1'): BlockConfig {
  return { id, type: 'features', variant: 'grid', props }
}

/** A block whose props make it a tab set, with three items. */
function threeTabs(overrides: Record<string, unknown> = {}): BlockConfig {
  return tabsBlock({
    title: 'Features',
    display: 'tabs',
    items: [item('One', 'First'), item('Two', 'Second'), item('Three', 'Third')],
    ...overrides,
  })
}

function html(...blocks: BlockConfig[]): string {
  return exportSiteToHTML(site(blocks))
}

/** The tablist element's inner region — everything between its open and close. */
function tablistInner(doc: string): string {
  const start = doc.indexOf('<div role="tablist"')
  expect(start, 'no tablist rendered').toBeGreaterThan(-1)
  const end = doc.indexOf('</div>', start)
  expect(end).toBeGreaterThan(start)
  return doc.slice(start, end)
}

function allButtons(doc: string): string[] {
  return doc.match(/<button[^>]*>/g) ?? []
}

/** Each panel's full element, from its open tag to the section terminator. */
function allPanels(doc: string): string[] {
  const panels: string[] = []
  const open = /<div role="tabpanel"[^>]*>/g
  const CLOSE = '\n  </section>'
  for (let m = open.exec(doc); m; m = open.exec(doc)) {
    const end = doc.indexOf(CLOSE, m.index)
    expect(end, `panel at ${m.index} is never closed`).toBeGreaterThan(-1)
    panels.push(doc.slice(m.index, end))
  }
  return panels
}

describe('SC-001 / FR-001 — one tab list, one tab and one panel per item', () => {
  it('renders exactly one tab list with three tabs and three panels', () => {
    const doc = html(threeTabs())
    expect(doc.match(/role="tablist"/g) ?? []).toHaveLength(1)
    expect(doc.match(/data-sb-tab /g) ?? []).toHaveLength(3)
    expect(doc.match(/role="tabpanel"/g) ?? []).toHaveLength(3)
  })

  it.each(['grid', 'list', 'alternating', 'bogus-variant'])(
    'variant %s produces the same tab markup for the same items',
    (variant) => {
      const block = threeTabs()
      block.variant = variant
      const doc = html(block)

      expect(doc.match(/role="tablist"/g) ?? []).toHaveLength(1)
      expect(doc.match(/role="tabpanel"/g) ?? []).toHaveLength(3)
      // The variant is ignored in tab mode: nothing from the grid or the list
      // card renderer survives.
      expect(doc).not.toContain('xl:grid-cols-3')
      expect(doc).not.toContain('group bg-bg-2 border border-border-default rounded-xl p-5')
    },
  )

  it('the tab markup is byte-identical across variants apart from the header text', () => {
    const strip = (doc: string): string => doc.slice(doc.indexOf('<div role="tablist"'))

    const grid = threeTabs({ title: 'Same' })
    grid.variant = 'grid'
    const list = threeTabs({ title: 'Same' })
    list.variant = 'list'

    expect(strip(html(grid))).toBe(strip(html(list)))
  })

  it('a non-tab features block still renders the default layout', () => {
    const block = tabsBlock({
      title: 'Features',
      items: [item('One', 'First'), item('Two', 'Second')],
    })
    const doc = html(block)
    expect(doc).not.toContain('role="tablist"')
    expect(doc).toContain('xl:grid-cols-3')
  })

  it('a tab option with fewer than two items renders the default layout', () => {
    const doc = html(tabsBlock({ title: 'Only', display: 'tabs', items: [item('One', 'First')] }))
    expect(doc).not.toContain('role="tablist"')
    expect(doc).toContain('xl:grid-cols-3')
  })

  it('a tab option with an empty item list renders the default layout', () => {
    const doc = html(tabsBlock({ title: 'None', display: 'tabs', items: [] }))
    expect(doc).not.toContain('role="tablist"')
    expect(doc).toContain('xl:grid-cols-3')
  })

  it('null and primitive item entries render the positional fallback without throwing', () => {
    // AI-generated props can hold nulls, numbers and plain strings where an item
    // object is expected; reading them defensively still yields one tab per entry.
    const doc = html(
      tabsBlock({ title: 'Odd', display: 'tabs', items: [null, 42, 'text', {}, { title: 7 }] }),
    )

    expect(doc.match(/role="tabpanel"/g) ?? []).toHaveLength(5)
    expect(doc).toContain('>Tab 1</button>')
    expect(doc).toContain('>Tab 5</button>')
  })

  it.each([['TABS'], ['tab'], ['tabs '], [1], [null], [true]])(
    'an unrecognized display value %p renders the default layout',
    (display) => {
      const doc = html(tabsBlock({ title: 'X', display, items: [item('One', 'First'), item('Two', 'Second')] }))
      expect(doc).not.toContain('role="tablist"')
    },
  )
})

describe('FR-002 — selection, references and the single tab stop', () => {
  it('the first tab is selected and every other tab is not', () => {
    const buttons = allButtons(html(threeTabs()))
    expect(buttons).toHaveLength(3)
    expect(buttons[0]).toContain('aria-selected="true"')
    expect(buttons[1]).toContain('aria-selected="false"')
    expect(buttons[2]).toContain('aria-selected="false"')
  })

  it('only the selected tab is in the tab order', () => {
    const buttons = allButtons(html(threeTabs()))
    expect(buttons[0]).toContain('tabindex="0"')
    expect(buttons[1]).toContain('tabindex="-1"')
    expect(buttons[2]).toContain('tabindex="-1"')
  })

  it('the first panel is visible and every other panel carries hidden', () => {
    // The OPEN TAG only: `allPanels` returns whole elements, so a body match
    // would see the next panel's tag (and this panel's `hidden` heading).
    const openTags = html(threeTabs()).match(/<div role="tabpanel"[^>]*>/g) ?? []
    expect(openTags).toHaveLength(3)
    expect(openTags[0]).not.toContain(' hidden')
    expect(openTags[1]).toContain(' hidden')
    expect(openTags[2]).toContain(' hidden')
  })

  it('every aria-controls names an existing panel and every panel is labelled by its tab', () => {
    const doc = html(threeTabs())
    const buttons = allButtons(doc)
    expect(buttons, 'no tab buttons rendered').toHaveLength(3)
    for (const button of buttons) {
      const controls = /aria-controls="([^"]+)"/.exec(button)?.[1]
      expect(controls, `button without aria-controls: ${button}`).toBeTruthy()
      const openTag = (doc.match(/<div role="tabpanel"[^>]*>/g) ?? []).find((tag) =>
        tag.includes(`id="${controls}" `) || tag.endsWith(`id="${controls}">`),
      )
      expect(openTag, `aria-controls ${controls} names no panel`).toBeTruthy()

      const labelledBy = /aria-labelledby="([^"]+)"/.exec(openTag!)?.[1]
      const tabId = /\sid="([^"]+)"/.exec(button)?.[1]
      expect(labelledBy).toBe(tabId)
    }
  })

  it('every tab and panel id on the page is unique', () => {
    const doc = html(threeTabs())
    const ids = [...doc.matchAll(/\sid="(sb_tabs_[^"]+)"/g)].map((m) => m[1])
    expect(ids).toHaveLength(6)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every generated id uses only letters, digits, hyphens and underscores', () => {
    const doc = html(threeTabs())
    const ids = [...doc.matchAll(/\sid="(sb_tabs_[^"]+)"/g)]
    expect(ids, 'no generated ids found').toHaveLength(6)
    for (const [, id] of ids) {
      expect(id, id).toMatch(ID_CHARSET_RE)
      expect(id.startsWith(TAB_ID_PREFIX)).toBe(true)
      expect(TAB_ID_RE.test(id) || PANEL_ID_RE.test(id), id).toBe(true)
    }
  })
})

describe('FR-001 / FR-002 — several tab sets stay independent on one page', () => {
  it('numbers each tab set separately and keeps its ids disjoint', () => {
    const doc = html(threeTabs(), tabsBlock({
      title: 'Second',
      display: 'tabs',
      items: [item('A', 'a'), item('B', 'b')],
    }, 'f-2'))

    expect(doc).toContain('id="sb_tabs_1_t1"')
    expect(doc).toContain('id="sb_tabs_1_p1"')
    expect(doc).toContain('id="sb_tabs_2_t1"')
    expect(doc).toContain('id="sb_tabs_2_p1"')
    expect(doc.match(/role="tablist"/g) ?? []).toHaveLength(2)
  })

  it('two blocks sharing one block id still get distinct tab ids, and the anchor id lands once', () => {
    const doc = html(
      threeTabs(),
      tabsBlock({ title: 'Twin', display: 'tabs', items: [item('A', 'a'), item('B', 'b')] }, 'f-1'),
    )

    expect(doc).toContain('id="sb_tabs_1_t1"')
    expect(doc).toContain('id="sb_tabs_2_t1"')
    // The anchor id is only emitted on the first block that claims it.
    expect(doc.match(/<section id="f-1"/g) ?? []).toHaveLength(1)
    expect(doc).not.toMatch(/<section id="[^"]*"[^>]*id="f-1"/)
  })

  it('the per-document counter restarts on every page of a multi-page site', () => {
    // Page 1 carries TWO tab sets and page 2 carries ONE, so a counter shared
    // across pages would give page 2 `sb_tabs_3`. A single-set-per-page fixture
    // cannot distinguish a restarting counter from a constant one.
    const tabSet = {
      title: 'Tabs',
      display: 'tabs',
      items: [item('One', 'First'), item('Two', 'Second')],
    }
    const pages = exportSitePages({
      name: 'Site',
      blocks: [],
      pages: [
        {
          id: 'a',
          name: 'A',
          path: '/',
          blocks: [tabsBlock(tabSet, 'f-a1'), tabsBlock({ ...tabSet, title: 'Second' }, 'f-a2')],
        },
        { id: 'b', name: 'B', path: '/b', blocks: [tabsBlock(tabSet, 'f-b')] },
      ],
    } as SiteConfig)

    expect(pages).toHaveLength(2)
    expect(pages[0].html).toContain('id="sb_tabs_1_t1"')
    expect(pages[0].html).toContain('id="sb_tabs_2_t1"')
    expect(pages[1].html).toContain('id="sb_tabs_1_t1"')
    expect(pages[1].html).not.toContain('sb_tabs_2_')
    expect(pages[1].html).not.toContain('sb_tabs_3_')
  })
})

describe('FR-003 / NF-006 — panel content and class lists', () => {
  it('each panel leads with a hidden heading carrying the item title', () => {
    const doc = html(threeTabs())
    expect(doc.match(/<h3 data-sb-tab-title hidden/g) ?? []).toHaveLength(3)
    expect(doc).toMatch(/<h3 data-sb-tab-title hidden[^>]*>One<\/h3>/)
    expect(doc).toContain('First</p>')
  })

  it('the heading precedes the description inside its panel', () => {
    const panel = allPanels(html(threeTabs()))[0]
    expect(panel.indexOf('data-sb-tab-title')).toBeLessThan(panel.indexOf('<p '))
  })

  it('no panel carries a display utility or a transition, so [hidden] still hides it', () => {
    const openTags = html(threeTabs()).match(/<div role="tabpanel"[^>]*>/g) ?? []
    expect(openTags, 'no panels rendered').toHaveLength(3)
    for (const tag of openTags) {
      const classes = /class="([^"]*)"/.exec(tag)?.[1] ?? ''
      for (const banned of ['block', 'flex', 'grid', 'inline', 'inline-block', 'hidden']) {
        expect(classes.split(/\s+/), `panel class: ${classes}`).not.toContain(banned)
      }
      expect(classes).not.toContain('transition')
      expect(classes).not.toContain('animate')
    }
  })

  it('every tab carries the minimum tap target size', () => {
    const buttons = allButtons(html(threeTabs()))
    expect(buttons, 'no tab buttons rendered').toHaveLength(3)
    for (const button of buttons) {
      expect(button).toContain('min-h-[40px]')
      expect(button).toContain('min-w-[40px]')
    }
  })

  it('the header keeps the same label/title/subtitle shape as the default layout', () => {
    const doc = html(threeTabs({ label: 'Label', subtitle: 'Sub' }))
    expect(doc).toContain('>Label</div>')
    expect(doc).toContain('>Sub</p>')
    expect(doc).toMatch(/<h2 class="[^"]*">Features<\/h2>/)
  })

  it('an absent label and subtitle emit no header line', () => {
    const doc = html(threeTabs({ label: undefined, subtitle: undefined }))
    const start = doc.indexOf('      <div class="text-center mb-10">')
    expect(start, 'no header block rendered').toBeGreaterThan(-1)
    const header = doc.slice(start, doc.indexOf('      </div>', start))

    expect(header).not.toContain('tracking-widest')
    expect(header).not.toContain('max-w-lg')
    expect(header.match(/<h2 /g) ?? []).toHaveLength(1)
  })

  it('the tab header is byte-identical to the default layout header', () => {
    // The tab-set comparison masks the whole section, so a header that drifted
    // from the default renderer would be invisible to it. Pin the header block
    // itself against the default layout for the same props.
    const header = (doc: string): string => {
      const start = doc.indexOf('      <div class="text-center mb-10">')
      expect(start, 'no header block rendered').toBeGreaterThan(-1)
      return doc.slice(start, doc.indexOf('      </div>', start))
    }
    const props = {
      title: 'Same',
      label: 'Label',
      subtitle: 'Sub',
      items: [item('One', 'First'), item('Two', 'Second')],
    }

    expect(header(html(tabsBlock({ ...props, display: 'tabs' })))).toBe(header(html(tabsBlock(props))))
  })
})

describe('FR-001 / SC-002 — an empty or whitespace-only title gets a positional fallback label', () => {
  it.each([
    ['empty', ''],
    ['single space', ' '],
    ['tab and newline', ' \t\n '],
  ])('a %s title renders the label Tab N at its 1-based position', (_label, blank) => {
    const doc = html(
      threeTabs({ items: [item(blank, 'First'), item('Real', 'Second'), item('  ', 'Third')] }),
    )

    expect(doc).toContain('>Tab 1</button>')
    expect(doc).toContain('>Real</button>')
    expect(doc).toContain('>Tab 3</button>')
  })

  it('the fallback label is escaped like any other label', () => {
    const doc = html(threeTabs({ items: [item('', 'First'), item('<b>x</b>', 'Second')] }))
    expect(doc).toContain('>Tab 1</button>')
    expect(doc).toContain('&lt;b&gt;x&lt;/b&gt;</button>')
    expect(doc).not.toContain('<b>x</b>')
  })

  it('a non-blank title is emitted verbatim, not trimmed', () => {
    // The label is the item title; only a blank title takes the positional
    // fallback, so surrounding whitespace inside a real title is preserved.
    const doc = html(threeTabs({ items: [item('  Two  ', 'First'), item('Three', 'Third')] }))
    expect(doc).toContain('>  Two  </button>')
    expect(doc).toContain('>  Two  </h3>')
  })

  it('the panel heading carries the same fallback label as its tab', () => {
    const doc = html(threeTabs({ items: [item('', 'First'), item('Real', 'Second')] }))
    expect(doc).toContain('>Tab 1</h3>')
  })
})

describe('FR-001 — the tab set stays inside the block, with one script for the page', () => {
  it('the tab list holds exactly the tab buttons and nothing else', () => {
    const inner = tablistInner(html(threeTabs()))
    expect(inner.match(/<button/g) ?? []).toHaveLength(3)
    expect(inner).not.toContain('role="tabpanel"')
  })

  it('a page with a tab set carries exactly one shared script element', () => {
    const doc = html(threeTabs())
    expect(doc.match(/<script data-sb-runtime>/g) ?? []).toHaveLength(1)
  })
})
