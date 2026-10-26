/**
 * The injection corpus against the tab-set export.
 *
 * The shipped corpus file compares each payload's script count against a
 * `props: {}` render, which is the wrong clean side here: a tab set legitimately
 * emits the shared runtime script, so that differential would flag every tab
 * page as injected. The clean side for this suite is a TAB-SET page with
 * ordinary copy, so the only difference between the two exports is the payload.
 *
 * The whole-document handler scan and the runtime-source scan mirror the shipped
 * suite and stay exactly as strict: a payload that reaches a tag position is an
 * injection whether or not the block renders tabs.
 */
import { stripSeo } from './helpers/seo-head-allowed-diff'
import { describe, it, expect } from 'vitest'
import { exportSiteToHTML } from '../src/lib/export-html'
import { BEHAVIOR_RUNTIME_SOURCE } from '../src/lib/export-behavior-runtime'
import type { BlockConfig, SiteConfig } from '../src/blocks/types'

const CORPUS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><script>alert(1)</script>',
  "' onfocus='x",
  '"><svg/onload=alert(1)>',
  '&amp;',
  '&#106;avascript:alert(1)',
  // Unicode: RTL override and an emoji, the two cases that break naive
  // direction or width assumptions rather than only quoting.
  '‮gnitset‭',
  '🙂 tab',
  // A 10 000-character title is the corpus length explicitly named.
  'X'.repeat(10_000),
]

/** An `on*=` HANDLER inside a real open tag, not escaped text in a text run. */
const HANDLER_RE = /<[a-zA-Z][^>]*[^\w]on[a-z]+\s*=/i
const countScripts = (html: string): number => (html.match(/<script/gi) ?? []).length
const ID_CHARSET_RE = /^[A-Za-z0-9_-]+$/

function tabPage(titles: string[], descriptions: string[], label?: string): string {
  const blocks: BlockConfig[] = [
    {
      id: 'f-1',
      type: 'features',
      variant: 'grid',
      props: {
        title: 'Features',
        ...(label === undefined ? {} : { label }),
        display: 'tabs',
        items: titles.map((title, i) => ({ title, description: descriptions[i] ?? 'Body' })),
      },
    },
  ]
  return exportSiteToHTML({ name: 'XSS', blocks } as SiteConfig)
}

/**
 * The label's emitted bytes. A test-local oracle on purpose: deriving the
 * expectation from `escapeHtml` would move with the implementation, so a
 * dropped escape would change both sides and stay green.
 */
function escapeLabel(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const LABEL_DIV_RE = /<div class="text-\[11px\][^"]*">([\s\S]*?)<\/div>/

/** The text run the label div actually emitted, or null when no label rendered. */
function emittedLabel(html: string): string | null {
  return LABEL_DIV_RE.exec(html)?.[1] ?? null
}

/** The same page with benign copy — the differential the script count compares against. */
const CLEAN = tabPage(['One', 'Two'], ['First', 'Second'])

function expectInert(html: string, msg: string): void {
  expect(html, `${msg}: renderer blanked`).toContain('role="tablist"')
  // The font link's fixed inline onload is a permitted head addition; remove it before scanning.
  expect(stripSeo(html).match(HANDLER_RE) ?? [], `${msg}: injected handler`).toEqual([])
  expect(countScripts(html), `${msg}: injected script`).toBe(countScripts(CLEAN))
  const ids = [...html.matchAll(/\sid="(sb_tabs_[^"]+)"/g)]
  expect(ids.length, `${msg}: no generated ids`).toBeGreaterThan(0)
  for (const [, id] of ids) {
    expect(id, `${msg}: id charset`).toMatch(ID_CHARSET_RE)
  }
}

describe('payloads in tab labels and panel bodies stay inert', () => {
  for (const payload of CORPUS) {
    it(`title ← ${JSON.stringify(payload.slice(0, 40))}`, () => {
      const html = tabPage([payload, 'Two'], ['First', 'Second'])
      const msg = `title ← ${payload.slice(0, 40)}`

      expectInert(html, msg)
      if (payload.includes('<')) {
        expect(html, `${msg}: raw payload present`).not.toContain(payload)
      }
    })

    it(`description ← ${JSON.stringify(payload.slice(0, 40))}`, () => {
      const html = tabPage(['One', 'Two'], [payload, 'Second'])
      const msg = `description ← ${payload.slice(0, 40)}`

      expectInert(html, msg)
      if (payload.includes('<')) {
        expect(html, `${msg}: raw payload present`).not.toContain(payload)
      }
    })

    it(`title beside a Tab N label ← ${JSON.stringify(payload.slice(0, 40))}`, () => {
      // The payload is a real title on the first item; the empty second item
      // takes the `Tab N` fallback, so both label shapes are on the same page.
      const html = tabPage([payload, ''], ['First', 'Second'])
      expectInert(html, `title beside a Tab N label ← ${payload.slice(0, 40)}`)
    })
  }
})

describe('the payload survives as inert, literal text', () => {
  it('a markup payload is escaped into visible text rather than dropped', () => {
    const payload = '<img src=x onerror=alert(1)>'
    const html = tabPage([payload, 'Two'], ['First', 'Second'])

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;</button>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;</h3>')
  })

  it('the block title, label and subtitle are escaped on a tab page too', () => {
    const blocks: BlockConfig[] = [
      {
        id: 'f-1',
        type: 'features',
        variant: 'grid',
        props: {
          title: '<h2>x</h2>',
          label: '<b>label</b>',
          subtitle: '"><script>alert(1)</script>',
          display: 'tabs',
          items: [{ title: 'One', description: 'First' }, { title: 'Two', description: 'Second' }],
        },
      },
    ]
    const html = exportSiteToHTML({ name: 'XSS', blocks } as SiteConfig)

    expect(html).toContain('&lt;h2&gt;x&lt;/h2&gt;</h2>')
    expect(html).toContain('&lt;b&gt;label&lt;/b&gt;</div>')
    expect(html).not.toContain('<b>label</b>')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(countScripts(html)).toBe(countScripts(CLEAN))
  })

  it('a 10 000-character title is emitted in full, not truncated', () => {
    const payload = 'X'.repeat(10_000)
    const html = tabPage([payload, 'Two'], ['First', 'Second'])

    expect(html).toContain(`${payload}</button>`)
    expectInert(html, 'long title')
  })
})

describe('a payload in the block label stays inert too', () => {
  // The label is a user-controlled text run rendered by the SAME renderer as
  // the title; without this matrix the sink is unasserted and a dropped escape
  // would ship a live handler while the whole suite stayed green.
  for (const payload of CORPUS) {
    it(`label ← ${JSON.stringify(payload.slice(0, 40))}`, () => {
      const html = tabPage(['One', 'Two'], ['First', 'Second'], payload)
      const msg = `label ← ${payload.slice(0, 40)}`

      // Whole-document checks: no live handler, no new script, ids intact.
      expectInert(html, msg)

      // The emitted label bytes themselves — an exact expectation, not an
      // intermediate value. A dropped escape fails here even for a payload
      // (a quote, an entity) that would still be inert as bare text.
      const label = emittedLabel(html)
      expect(label, `${msg}: no label emitted`).not.toBeNull()
      expect(label, `${msg}: label bytes`).toBe(escapeLabel(payload))
      expect(label, `${msg}: unescaped markup char`).not.toContain('<')

      if (payload.includes('<')) {
        expect(html, `${msg}: raw payload present`).not.toContain(payload)
      }
    })
  }
})

describe('the shared runtime source stays injection-free', () => {
  it('carries no HTML-string injection and no dynamic evaluation', () => {
    expect(BEHAVIOR_RUNTIME_SOURCE).not.toMatch(/\beval\b/)
    expect(BEHAVIOR_RUNTIME_SOURCE).not.toMatch(/new\s+Function\b/)
    expect(BEHAVIOR_RUNTIME_SOURCE).not.toMatch(/\binnerHTML\b/)
    expect(BEHAVIOR_RUNTIME_SOURCE).not.toMatch(/\bdocument\.write\b/)
  })

  it('emits no event-handler attribute of its own', () => {
    expect(BEHAVIOR_RUNTIME_SOURCE.match(HANDLER_RE) ?? []).toEqual([])
  })
})
