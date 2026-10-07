// @vitest-environment node
/**
 * FR-E3 — the BUILT worker entry loads and runs with NO browser globals.
 *
 * Vitest runs the rest of this suite under jsdom with a `localStorage` polyfill,
 * so a future MODULE-SCOPE read of `localStorage` / `window` / `document` /
 * `import.meta.env` anywhere in the worker's import closure (for example in
 * any module the worker entry reaches) would pass CI and then
 * throw at load time in every Cloudflare Worker. This file is the gate for that.
 *
 * Mechanism: install throwing accessors for the browser globals BEFORE the
 * built worker entry is imported, import it, run `normalizePagePaths` and
 * `exportSitePages` once on a small config, then assert no trap fired. The
 * subject is the BUILT artifact (what consumers load), not the source.
 *
 * Non-vacuity: this test was proven RED by injecting a module-scope
 * `localStorage.getItem('x')` into a module in the worker closure and rebuilding
 * (RED: "worker entry touched browser global \"localStorage\""; restored -> GREEN).
 * The evidence record lives in the plan's harness report, not in this repo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ensureFreshBuild } from './helpers/ensure-fresh-build'

/** Browser/DOM globals a Worker does not have (or must not touch at load). */
const TRAPPED_GLOBALS = [
  'localStorage',
  'sessionStorage',
  'document',
  'window',
  'navigator',
  'fetch',
  'XMLHttpRequest',
] as const

const WORKER_ARTIFACT = resolve(import.meta.dirname, '..', 'dist', 'worker.js')

const tripped: string[] = []
const saved = new Map<string, PropertyDescriptor | undefined>()

beforeAll(() => {
  // Build FIRST, while the globals are still intact: the dynamic import below
  // must be the only thing running under the traps.
  ensureFreshBuild()
  for (const name of TRAPPED_GLOBALS) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        tripped.push(name)
        throw new Error(`worker entry touched browser global "${name}"`)
      },
    })
  }
}, 300_000)

afterAll(() => {
  for (const name of TRAPPED_GLOBALS) {
    const original = saved.get(name)
    if (original) Object.defineProperty(globalThis, name, original)
    else delete (globalThis as Record<string, unknown>)[name]
  }
})

describe('FR-E3 — the built worker entry needs no DOM globals', () => {
  it('the traps are live (a read of each trapped global throws and is recorded)', () => {
    // Without this, a trap that silently failed to install would make the
    // import test below pass while checking nothing.
    for (const name of TRAPPED_GLOBALS) {
      expect(() => (globalThis as Record<string, unknown>)[name], name).toThrow(/browser global/)
    }
    expect([...new Set(tripped)].sort()).toEqual([...TRAPPED_GLOBALS].sort())
    tripped.length = 0
  })

  it('imports the built worker and runs normalizePagePaths + exportSitePages without touching one', async () => {
    const worker = await import(/* @vite-ignore */ pathToFileURL(WORKER_ARTIFACT).href)

    const config = {
      name: 'Node env',
      pages: [
        {
          name: 'Home',
          path: '/',
          blocks: [{ id: 'h1', type: 'hero', props: { title: 'Hello' } }],
        },
      ],
    }
    expect(worker.normalizePagePaths(config.pages.map((page) => page.path))).toEqual(['/'])
    const docs = worker.exportSitePages(config)

    expect(docs).toHaveLength(1)
    expect(docs[0].path).toBe('/')
    expect(docs[0].html).toContain('</body>')
    expect(tripped, `browser globals touched: ${tripped.join(', ')}`).toEqual([])
  })
})
