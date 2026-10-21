/**
 * Visitor flows on an exported page that carries a faq block, plus the
 * script-disabled fallback and the editor/export parity check.
 *
 * Every page is built with the real exporter, parsed into the test document and
 * the single inline runtime is started once for the whole file. jsdom does not
 * run scripts assigned through `innerHTML`, so the runtime text is evaluated
 * explicitly with `new Function` — the same bytes a browser would run.
 *
 * The fixture blocks live in `tests/helpers/behavior-fixtures.ts`; the shared
 * behavior table and its runner live in `tests/helpers/behavior-test-table.ts`
 * (re-exporting the fixtures). The parity row replays that table in the React
 * preview and in the exported page and compares the outcomes.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { act, createElement, Fragment } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { exportSiteToHTML } from '../../src/lib/export-html'
import { BEHAVIOR_RUNTIME_SOURCE } from '../../src/lib/export-behavior-runtime'
import { RenderBlock } from '../../src/blocks/registry'
import {
  BEHAVIOR_CASES,
  EDITOR_CASES,
  FIXTURE_BLOCKS,
  isFaqOpen,
  runCase,
  type BehaviorAdapter,
} from '../helpers/behavior-test-table'
import {
  stripLegacyFaq,
  stripRuntimeAdditions,
} from '../helpers/behavior-runtime-allowed-diff'
import type { BlockConfig, SiteConfig } from '../../src/blocks/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SITE = 'Site'
const SIZE_CAP_BYTES = 5120

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

const menuButtons = (): HTMLButtonElement[] =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-sb-menu-toggle]'))

const faqButtons = (): HTMLButtonElement[] =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('section button[aria-expanded]'))

const click = (element: Element): void => {
  ;(element as HTMLElement).click()
}

const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1

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

let runtime = ''

beforeAll(() => {
  runtime =
    parse(exportSiteToHTML(site(FIXTURE_BLOCKS['navbar-and-faq'])))
      .querySelector('script[data-sb-runtime]')
      ?.textContent ?? ''
  expect(runtime).not.toBe('')
  new Function(runtime)()
})

afterEach(() => {
  document.body.innerHTML = ''
  ;(window as unknown as { matchMedia?: unknown }).matchMedia = undefined
})

describe('exported faq flows', () => {
  it('opens the first answer and collapses the rest by default', () => {
    const page = parse(exportSiteToHTML(site(FIXTURE_BLOCKS.faq)))
    const buttons = Array.from(
      page.querySelectorAll<HTMLButtonElement>('section button[aria-expanded]'),
    )
    const contents = Array.from(page.querySelectorAll<HTMLElement>('.faq-content'))

    expect(buttons.map((button) => button.getAttribute('aria-expanded'))).toEqual([
      'true',
      'false',
      'false',
    ])
    expect(contents).toHaveLength(3)
    expect(contents[0].className).toContain('max-h-[500px]')
    expect(contents[0].className).toContain('pb-4')
    expect(contents[1].className).toContain('max-h-0')
    expect(contents[2].className).toContain('max-h-0')

    // The runtime performs no initialization work, so mounting keeps the state.
    mount(page)
    expect(faqButtons().map(isFaqOpen)).toEqual([true, false, false])
  })

  it('switches the open answer to the clicked question', () => {
    mount(parse(exportSiteToHTML(site(FIXTURE_BLOCKS.faq))))
    const buttons = faqButtons()

    click(buttons[1])

    expect(faqButtons().map(isFaqOpen)).toEqual([false, true, false])
    const opened = buttons[1].nextElementSibling as HTMLElement
    expect(opened.style.maxHeight).toBe('500px')
    expect(opened.style.paddingBottom).toBe('1rem')
    expect((buttons[0].nextElementSibling as HTMLElement).style.maxHeight).toBe('0px')
  })

  it('closes the only open answer on a second click', () => {
    mount(parse(exportSiteToHTML(site(FIXTURE_BLOCKS.faq))))
    const first = faqButtons()[0]
    expect(isFaqOpen(first)).toBe(true)

    click(first)

    expect(faqButtons().map(isFaqOpen)).toEqual([false, false, false])
    const chevron = first.querySelector('.faq-chevron') as HTMLElement
    expect(chevron.classList.contains('rotate-180')).toBe(false)
    expect(chevron.style.transform).toBe('')
    expect(chevron.classList.contains('text-text-3')).toBe(true)
  })

  it('leaves a second faq section untouched when one item changes', () => {
    const faqBlock = (id: string, prefix: string): BlockConfig => ({
      id,
      type: 'faq',
      variant: 'accordion',
      props: {
        title: `${prefix} questions`,
        items: [
          { question: `${prefix}1?`, answer: `${prefix} answer one.` },
          { question: `${prefix}2?`, answer: `${prefix} answer two.` },
        ],
      },
    })
    mount(parse(exportSiteToHTML(site([faqBlock('faq-a', 'A'), faqBlock('faq-b', 'B')]))))
    const sections = Array.from(document.querySelectorAll('section')).filter((section) =>
      section.querySelector('.faq-content'),
    )
    expect(sections).toHaveLength(2)
    const buttonsA = Array.from(
      sections[0].querySelectorAll<HTMLButtonElement>('button[aria-expanded]'),
    )
    const buttonsB = Array.from(
      sections[1].querySelectorAll<HTMLButtonElement>('button[aria-expanded]'),
    )
    expect(buttonsA.map(isFaqOpen)).toEqual([true, false])
    expect(buttonsB.map(isFaqOpen)).toEqual([true, false])

    click(buttonsB[1])

    expect(buttonsB.map(isFaqOpen)).toEqual([false, true])
    // Section A keeps both its expanded state and its untouched inline styles.
    expect(buttonsA.map(isFaqOpen)).toEqual([true, false])
    expect((buttonsA[0].nextElementSibling as HTMLElement).style.maxHeight).toBe('')
    expect((buttonsA[1].nextElementSibling as HTMLElement).style.maxHeight).toBe('')
  })
})

describe('script-disabled fallback', () => {
  it('ships noscript overrides that open the faq and reveal the panel', () => {
    const page = parse(exportSiteToHTML(site(FIXTURE_BLOCKS['navbar-and-faq'])))
    const style = page.querySelector('noscript style')
    const css = style?.textContent ?? ''

    expect(style).not.toBeNull()
    // Every override is emitted with `!important`, so it beats a utility class
    // that would otherwise keep the answer collapsed or the panel hidden.
    expect(css).toContain('[data-sb-menu-toggle]{display:none!important}')
    expect(css).toContain(
      '@media (max-width:1023.98px){[data-sb-menu-panel]{display:block!important}}',
    )
    expect(css).toContain('.faq-content{max-height:none!important;padding-bottom:1rem!important}')
    expect(css).toContain('.faq-chevron{display:none!important}')

    // Nothing has run in a parsed document: the toggle starts collapsed and a
    // click cannot change it, which is the state the stylesheet serves.
    const toggle = page.querySelector<HTMLButtonElement>('button[data-sb-menu-toggle]')
    expect(toggle).not.toBeNull()
    const panel = page.getElementById(toggle!.getAttribute('aria-controls') ?? '')
    expect(panel).not.toBeNull()
    expect(panel!.hidden).toBe(true)

    const buttons = Array.from(
      page.querySelectorAll<HTMLButtonElement>('section button[aria-expanded]'),
    )
    const before = buttons.map((button) => button.getAttribute('aria-expanded'))
    click(buttons[1])
    expect(buttons.map((button) => button.getAttribute('aria-expanded'))).toEqual(before)
    // Manual check remains: the actual layout at each breakpoint is a
    // computed-style concern jsdom does not model.
  })
})

describe('safety and packaging', () => {
  it('ships no legacy handler and the faq responds only through the runtime', () => {
    const corpusDir = resolve(import.meta.dirname, '../fixtures/export-legacy-corpus')
    const corpus = readdirSync(corpusDir)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => JSON.parse(readFileSync(resolve(corpusDir, file), 'utf8')) as {
        config: SiteConfig
        options?: { settings?: Record<string, string> }
      })

    const pages = [
      exportSiteToHTML(site(FIXTURE_BLOCKS['navbar-and-faq'])),
      ...corpus.map((entry) => exportSiteToHTML(entry.config, entry.options ?? undefined)),
    ]
    for (const html of pages) {
      expect(html).not.toContain('toggleFaq')
      expect(html).not.toContain('onclick=')
    }

    // A parsed copy has no runtime attached: clicking a question changes nothing.
    const html = exportSiteToHTML(site(FIXTURE_BLOCKS.faq))
    const detached = parse(html)
    const detachedButtons = Array.from(
      detached.querySelectorAll<HTMLButtonElement>('section button[aria-expanded]'),
    )
    click(detachedButtons[1])
    expect(detachedButtons[1].getAttribute('aria-expanded')).toBe('false')

    // The same page where the runtime runs toggles on the same click.
    mount(parse(html))
    click(faqButtons()[1])
    expect(faqButtons()[1].getAttribute('aria-expanded')).toBe('true')
  })

  it('keeps an injected script payload inert in the faq text', () => {
    const payload = '</script><script>alert(1)</script>'
    const config = site([
      {
        id: 'faq-payload',
        type: 'faq',
        variant: 'accordion',
        props: { title: 'FAQ', items: [{ question: payload, answer: payload }] },
      },
    ])
    const html = exportSiteToHTML(config)

    expect(count(html, '<script data-sb-runtime>')).toBe(1)
    expect(html).not.toContain(payload)

    const page = parse(html)
    expect(page.querySelector('section button > span')?.textContent).toBe(payload)
    expect(page.querySelector('.faq-content p')?.textContent).toBe(payload)
    expect(page.querySelectorAll('script[data-sb-runtime]')).toHaveLength(1)
    // The escaped payload did not open a second script element.
    const clean = parse(
      exportSiteToHTML(
        site([
          {
            id: 'faq-payload',
            type: 'faq',
            variant: 'accordion',
            props: { title: 'FAQ', items: [{ question: 'Q?', answer: 'A.' }] },
          },
        ]),
      ),
    )
    expect(page.querySelectorAll('script')).toHaveLength(clean.querySelectorAll('script').length)
    expect(
      Array.from(page.querySelectorAll('script')).some((script) =>
        (script.textContent ?? '').includes('alert('),
      ),
    ).toBe(false)

    // The runtime still drives the injected row, and the payload stays text.
    mount(page)
    click(faqButtons()[0])
    expect(faqButtons()[0].getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('.faq-content p')?.textContent).toBe(payload)
  })

  it('keeps the shipped runtime within the 5 KB gzip budget', () => {
    expect(gzipSync(Buffer.from(BEHAVIOR_RUNTIME_SOURCE, 'utf8')).length).toBeLessThanOrEqual(
      SIZE_CAP_BYTES,
    )
    const html = exportSiteToHTML(site(FIXTURE_BLOCKS['navbar-and-faq']))
    const emitted = /<script data-sb-runtime>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''
    expect(emitted).toBe(BEHAVIOR_RUNTIME_SOURCE)
    expect(gzipSync(Buffer.from(emitted, 'utf8')).length).toBeLessThanOrEqual(SIZE_CAP_BYTES)
    // The packed-tarball leak grep needs a packaging step, so it is deferred to
    // the release public-leak audit rather than approximated here.
  })
})

describe('editor parity', () => {
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
    faqButtons,
    click(element) {
      act(() => (element as HTMLElement).click())
    },
    key(element, key, mods) {
      act(() => {
        element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, altKey: !!mods?.alt, ctrlKey: !!mods?.ctrl, metaKey: !!mods?.meta, shiftKey: !!mods?.shift }))
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
    menuButtons,
    faqButtons,
    click(element) {
      ;(element as HTMLElement).click()
    },
    key(element, key, mods) {
      element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, altKey: !!mods?.alt, ctrlKey: !!mods?.ctrl, metaKey: !!mods?.meta, shiftKey: !!mods?.shift }))
    },
    setReducedMotion(on) {
      ;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = () =>
        mediaQuery(on)
    },
  }

  afterEach(unmountEditor)

  it('editor and export produce identical outcomes for every shared row', () => {
    expect(BEHAVIOR_CASES.length).toBeGreaterThan(0)
    // The loop below can only catch a behavior whose rows reached the table.
    expect(BEHAVIOR_CASES.some((behaviorCase) => behaviorCase.behavior === 'tabs')).toBe(true)
    expect(BEHAVIOR_CASES.some((behaviorCase) => behaviorCase.behavior === 'carousel')).toBe(true)
    // Filter rows exist and are export-only, so the replay loop skips them.
    expect(BEHAVIOR_CASES.some((behaviorCase) => behaviorCase.behavior === 'filter')).toBe(true)
    expect(EDITOR_CASES.some((behaviorCase) => behaviorCase.behavior === 'filter')).toBe(false)
    const rows = EDITOR_CASES.map((behaviorCase) => ({
      behaviorCase,
      editor: runCase(editorAdapter, behaviorCase),
      exported: runCase(exportAdapter, behaviorCase),
    }))

    for (const row of rows) {
      // `runCase` observes exactly the keys the row declares, so both sides are
      // compared against the same concrete expectation as well as each other.
      expect(row.exported, row.behaviorCase.id).toEqual(row.editor)
      expect(row.exported, row.behaviorCase.id).toEqual(row.behaviorCase.expect)
    }

    // Non-vacuity: the table really observed both open and closed outcomes.
    const menuStates = rows.flatMap(
      (row) =>
        ((row.exported.menus as Array<{ open: boolean }> | undefined) ?? []).map(
          (menu) => menu.open,
        ),
    )
    expect(menuStates).toContain(true)
    expect(menuStates).toContain(false)
    const faqStates = rows.flatMap((row) => (row.exported.faq as boolean[] | undefined) ?? [])
    expect(faqStates).toContain(true)
    expect(faqStates).toContain(false)
  })
})

describe('legacy fixtures', () => {
  it('differs from the frozen exports only by the permitted set', () => {
    const corpusDir = resolve(import.meta.dirname, '../fixtures/export-legacy-corpus')
    const entry = (slug: string): {
      config: SiteConfig
      options?: { settings?: Record<string, string> }
    } => JSON.parse(readFileSync(resolve(corpusDir, `${slug}.json`), 'utf8'))

    for (const slug of ['01-blocks-only-every-block-type', '05-single-page-home-with-settings']) {
      const loaded = entry(slug)
      const actual = exportSiteToHTML(loaded.config, loaded.options ?? undefined)
      const { html, counts } = stripRuntimeAdditions(actual)
      const frozen = readFileSync(resolve(corpusDir, `${slug}.html`), 'utf8')

      expect(html, `${slug}: diff outside the permitted set`).toBe(stripLegacyFaq(frozen).html)

      const blocks =
        Array.isArray(loaded.config.pages) && loaded.config.pages.length
          ? loaded.config.pages[0].blocks ?? []
          : loaded.config.blocks ?? []
      const navbars = blocks.filter((block) => block.type === 'navbar').length
      expect(counts, slug).toEqual({
        scripts: 1,
        noscript: 1,
        toggleAttrs: navbars,
        panels: navbars,
      })
    }

    // The frozen pre-change baseline predates every runtime addition; that is
    // what makes it the reference the corpus entries are compared against.
    const baseline = readFileSync(
      resolve(import.meta.dirname, '../fixtures/export-legacy-baseline.html'),
      'utf8',
    )
    expect(stripRuntimeAdditions(baseline).counts).toEqual({
      scripts: 0,
      noscript: 0,
      toggleAttrs: 0,
      panels: 0,
    })
    expect(stripLegacyFaq(baseline).counts).toEqual({ scripts: 1, onclick: 2, toggleFaq: 3 })
  })
})
