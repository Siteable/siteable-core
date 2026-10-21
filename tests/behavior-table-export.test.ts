/**
 * Shared behavior table run against an exported page.
 *
 * The exported HTML is the only artifact a visitor receives: the page is built
 * with the real exporter, parsed into the test document, and the inline
 * runtime is extracted and evaluated once. jsdom does not execute scripts
 * assigned through `innerHTML`, so the runtime text is started explicitly with
 * `new Function` — the same bytes the browser would run.
 *
 * The menu and faq cases themselves live in `helpers/behavior-test-table.ts`
 * and are shared verbatim with the editor run; this file only supplies the
 * environment adapter.
 */
import { describe, beforeAll, expect } from 'vitest'
import { exportSiteToHTML } from '../src/lib/export-html'
import {
  FIXTURE_BLOCKS,
  runBehaviorTable,
  type BehaviorAdapter,
  type Fixture,
} from './helpers/behavior-test-table'

/** A reduced-motion media query result, shaped like the browser's. */
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

function pageFor(fixture: Fixture): string {
  return exportSiteToHTML({ name: 'Site', blocks: FIXTURE_BLOCKS[fixture] })
}

function parsePage(fixture: Fixture): Document {
  return new DOMParser().parseFromString(pageFor(fixture), 'text/html')
}

let runtime = ''

beforeAll(() => {
  runtime = parsePage('navbar').querySelector('script[data-sb-runtime]')?.textContent ?? ''
  expect(runtime).not.toBe('')
  new Function(runtime)()
})

const adapter: BehaviorAdapter = {
  mount(fixture) {
    const page = parsePage(fixture)
    // The runtime is already running from `beforeAll`; keeping the tag would
    // leave an inert copy in the document under test.
    page.querySelector('script[data-sb-runtime]')?.remove()
    // Every case starts from an unstarted media-query state.
    ;(window as unknown as { matchMedia?: unknown }).matchMedia = undefined
    document.body.innerHTML = page.body.innerHTML
  },
  menuButtons: () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-sb-menu-toggle]')),
  faqButtons: () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('section button[aria-expanded]')),
  click(el) {
    ;(el as HTMLElement).click()
  },
  key(el, key, mods) {
    el.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        altKey: !!mods?.alt,
        ctrlKey: !!mods?.ctrl,
        metaKey: !!mods?.meta,
        shiftKey: !!mods?.shift,
      }),
    )
  },
  setReducedMotion(on) {
    ;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = () =>
      mediaQuery(on)
  },
}

describe('exported page behavior', () => {
  runBehaviorTable(adapter)
})
