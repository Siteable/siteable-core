/**
 * Visitor flows on an exported page that carries one or more navbars.
 *
 * Every page is built with the real exporter, parsed into the test document and
 * the single inline runtime is started once for the whole file. jsdom does not
 * run scripts assigned through `innerHTML`, so the runtime text is evaluated
 * explicitly with `new Function` — the same bytes a browser would run.
 *
 * The shared fixture blocks live in `tests/helpers/behavior-test-table.ts`.
 * This file covers the flows the shared table does not, so it adds only the
 * markup/configs those flows need.
 */
import { stripSeo } from '../helpers/seo-head-allowed-diff'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { exportSiteToHTML } from '../../src/lib/export-html'
import { exportSitePages } from '../../src/lib/export-site-pages'
import { BEHAVIOR_RUNTIME_SOURCE } from '../../src/lib/export-behavior-runtime'
import { FIXTURE_BLOCKS } from '../helpers/behavior-test-table'
import { ensureFreshBuild } from '../helpers/ensure-fresh-build'
import type { BlockConfig, SiteConfig } from '../../src/blocks/types'

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

const panelOf = (button: HTMLButtonElement): HTMLElement | null =>
  document.getElementById(button.getAttribute('aria-controls') ?? '')

const click = (element: Element): void => {
  ;(element as HTMLElement).click()
}

const pressEscape = (): void => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
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

/** A panel must carry no transition class and no inline transition. */
function panelHasTransition(panel: HTMLElement | null): boolean {
  if (!panel) return false
  const classTransition = panel.className.split(/\s+/).some(
    (name) =>
      (name.startsWith('transition') && name !== 'transition-none') ||
      (name.startsWith('animate') && name !== 'animate-none'),
  )
  return classTransition || panel.style.transition !== ''
}

let runtime = ''

beforeAll(() => {
  runtime =
    parse(exportSiteToHTML(site(FIXTURE_BLOCKS.navbar)))
      .querySelector('script[data-sb-runtime]')
      ?.textContent ?? ''
  expect(runtime).not.toBe('')
  new Function(runtime)()
})

afterEach(() => {
  document.body.innerHTML = ''
  ;(window as unknown as { matchMedia?: unknown }).matchMedia = undefined
})

describe('exported navbar flows', () => {
  it('opens the menu and exposes every nav link', () => {
    mount(parse(exportSiteToHTML(site(FIXTURE_BLOCKS.navbar))))
    const [toggle] = menuButtons()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const panel = panelOf(toggle)
    expect(panel).not.toBeNull()
    expect(panel!.hidden).toBe(false)

    // Every authored link reaches the panel, and a link can take focus.
    const links = Array.from(panel!.querySelectorAll('a'))
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/product', '/pricing'])
    expect(links.map((link) => link.textContent)).toEqual(['Product', 'Pricing'])
    const firstLink = links[0] as HTMLElement
    firstLink.focus()
    expect(document.activeElement).toBe(firstLink)
  })

  it('closes the menu on the second tap', () => {
    mount(parse(exportSiteToHTML(site(FIXTURE_BLOCKS.navbar))))
    const [toggle] = menuButtons()

    click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(panelOf(toggle)!.hidden).toBe(false)

    click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(panelOf(toggle)!.hidden).toBe(true)
  })

  it('closes the menu with Escape and returns focus to the toggle', () => {
    mount(parse(exportSiteToHTML(site(FIXTURE_BLOCKS.navbar))))
    const [toggle] = menuButtons()

    click(toggle)
    const panel = panelOf(toggle)!
    const link = panel.querySelector('a') as HTMLElement
    link.focus()
    expect(document.activeElement).toBe(link)

    pressEscape()

    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(panel.hidden).toBe(true)
    expect(document.activeElement).toBe(toggle)
  })

  it('keeps two navbars independent and their panel ids distinct', () => {
    mount(parse(exportSiteToHTML(site(FIXTURE_BLOCKS['two-navbars']))))
    const [first, second] = menuButtons()

    click(first)
    click(second)
    click(second)

    expect(first.getAttribute('aria-expanded')).toBe('true')
    expect(panelOf(first)!.hidden).toBe(false)
    expect(second.getAttribute('aria-expanded')).toBe('false')
    expect(panelOf(second)!.hidden).toBe(true)

    const controls = menuButtons().map((button) => button.getAttribute('aria-controls') ?? '')
    expect(controls).toEqual(['sb_menu_1', 'sb_menu_2'])
    expect(new Set(controls).size).toBe(controls.length)
    for (const id of controls) expect(document.getElementById(id)).not.toBeNull()
  })

  it('reduced motion changes no menu state and applies no transition', () => {
    mount(parse(exportSiteToHTML(site(FIXTURE_BLOCKS.navbar))))
    const [toggle] = menuButtons()
    const panel = panelOf(toggle)!
    const classesBefore = panel.className

    ;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = () =>
      mediaQuery(true)

    click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(panel.hidden).toBe(false)
    // The state flips synchronously; the runtime never writes a transition.
    expect(panel.style.transition).toBe('')
    expect(panelHasTransition(panel)).toBe(false)

    click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    // The same sequence with the preference off has the identical outcome.
    ;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = () =>
      mediaQuery(false)
    click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(panel.hidden).toBe(false)
    expect(panel.className).toBe(classesBefore)
    // Manual check remains: whether the browser omits the animation is a
    // computed-style concern jsdom does not model.
  })

  it('renders an empty panel for a navbar with zero links', () => {
    const navbar: BlockConfig = {
      id: 'nav-empty',
      type: 'navbar',
      variant: 'default',
      props: { logo: 'Acme', links: [], ctaText: 'Start' },
    }
    mount(parse(exportSiteToHTML(site([navbar]))))
    const [toggle] = menuButtons()
    const panel = panelOf(toggle)

    expect(panel).not.toBeNull()
    expect(panel!.querySelectorAll('a')).toHaveLength(0)
    expect(panel!.textContent?.trim()).toBe('')

    expect(() => click(toggle)).not.toThrow()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(panel!.hidden).toBe(false)
  })

  it('emits no runtime, no noscript and no byte change without navbar or faq', () => {
    const corpus = JSON.parse(
      readFileSync(
        resolve(
          import.meta.dirname,
          '../fixtures/export-legacy-corpus/01-blocks-only-every-block-type.json',
        ),
        'utf8',
      ),
    ) as { config: SiteConfig }
    const config: SiteConfig = {
      name: corpus.config.name,
      blocks: (corpus.config.blocks ?? []).filter(
        (block) => block.type !== 'navbar' && block.type !== 'faq',
      ),
    }
    const html = exportSiteToHTML(config, {
      settings: {
        siteName: 'No Behavior',
        gaId: 'G-NOBEHAVIOR1',
        posthogKey: 'phc_nobehavior_key',
      },
    })
    const golden = readFileSync(
      resolve(import.meta.dirname, '../fixtures/export-no-behavior-0.3.2.html'),
      'utf8',
    )

    expect(stripSeo(html)).toBe(golden)
    expect(html).not.toContain('data-sb-runtime')
    expect(stripSeo(html)).not.toContain('<noscript>')
  })

  it('keeps hostile link labels inert in the opened panel', () => {
    const markupLabel = '<img src=x onerror=alert(1)>'
    const quoteLabel = 'He said "hi" & left'
    const navbar: BlockConfig = {
      id: 'nav-hostile',
      type: 'navbar',
      variant: 'default',
      props: {
        logo: 'Acme',
        links: [
          { label: markupLabel, href: '/x' },
          { label: quoteLabel, href: '/y' },
        ],
        ctaText: 'Start',
      },
    }
    const html = exportSiteToHTML(site([navbar]))
    // The label reaches the bytes escaped, never as a real element.
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')

    mount(parse(html))
    const [toggle] = menuButtons()
    click(toggle)
    const panel = panelOf(toggle)!
    const links = Array.from(panel.querySelectorAll('a'))

    expect(links).toHaveLength(2)
    expect(links.map((link) => link.textContent)).toEqual([markupLabel, quoteLabel])
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/x', '/y'])
    expect(panel.querySelector('img')).toBeNull()
    expect(document.querySelectorAll('[onerror]')).toHaveLength(0)
  })

  it('emits the runtime only on pages that carry a navbar', () => {
    const hero: BlockConfig = {
      id: 'about-hero',
      type: 'hero',
      variant: 'centered',
      props: { headline: 'About' },
    }
    const docs = exportSitePages({
      name: 'Multi',
      pages: [
        { id: 'p1', name: 'Home', path: '/', blocks: FIXTURE_BLOCKS.navbar },
        { id: 'p2', name: 'About', path: '/about', blocks: [hero] },
        { id: 'p3', name: 'Contact', path: '/contact', blocks: FIXTURE_BLOCKS.navbar },
      ],
      blocks: [],
    })
    const count = (haystack: string, needle: string): number =>
      haystack.split(needle).length - 1

    expect(docs.map((doc) => doc.path)).toEqual(['/', '/about', '/contact'])
    expect(docs.map((doc) => count(doc.html, '<script data-sb-runtime>'))).toEqual([1, 0, 1])
    expect(docs.map((doc) => count(doc.html, '<noscript><style>'))).toEqual([1, 0, 1])

    for (const doc of [docs[0], docs[2]]) {
      expect(count(doc.html, 'aria-controls="sb_menu_1"')).toBe(1)
      expect(count(doc.html, 'id="sb_menu_1"')).toBe(1)
      expect(count(doc.html, 'sb_menu_2')).toBe(0)
    }
  })
})

describe('worker entry parity', () => {
  const workerConfig = site(FIXTURE_BLOCKS.navbar, 'Worker')
  let workerHtml = ''

  beforeAll(async () => {
    ensureFreshBuild()
    const worker = (await import(
      /* @vite-ignore */ pathToFileURL(
        resolve(import.meta.dirname, '..', '..', 'dist', 'worker.js'),
      ).href
    )) as {
      exportSitePages: (config: SiteConfig) => Array<{ path: string; html: string }>
    }
    const docs = worker.exportSitePages(workerConfig)
    expect(docs).toHaveLength(1)
    expect(docs[0].path).toBe('/')
    workerHtml = docs[0].html
  }, 300_000)

  it('renders the same page through the worker entry within the runtime budget', () => {
    expect(workerHtml).not.toBe('')
    expect(workerHtml).toBe(exportSiteToHTML(workerConfig))

    const emitted = /<script data-sb-runtime>([\s\S]*?)<\/script>/.exec(workerHtml)?.[1] ?? ''
    expect(emitted).toBe(BEHAVIOR_RUNTIME_SOURCE)
    expect(gzipSync(Buffer.from(emitted, 'utf8')).length).toBeLessThanOrEqual(SIZE_CAP_BYTES)
  })
})
