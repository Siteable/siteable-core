/**
 * FR-C1 — the worker-facing package entry (`@siteable/core/worker`).
 *
 * The package's only entry was the barrel, which
 * re-exports `CanvasToolbar`, `EditorLayout`, `useConfigStore` and
 * `useEditorStore`. Vite lib mode flattens that into a single `dist/index.js`
 * with top-level bare imports of `react`, `react/jsx-runtime`, `zustand`,
 * `@dnd-kit/*`, `sonner` and `lucide-react`, so a server or edge runtime (for example a Cloudflare Worker) could
 * not `import { exportSitePages } from '@siteable/core'` without dragging React
 * into the bundle. Deep-importing `src/lib/export-site-pages.ts` is not a
 * fallback either: `src` ships but its `@/` alias does not resolve for consumers.
 *
 * This module is deliberately a THIN re-export list and nothing more. It is a
 * list of names, not an implementation, so every module it pulls in is exactly
 * the transitive closure of those two functions. It is the root that
 * `tests/export-runtime-deps.test.ts` walks (FR-H3) and the file `vite build`
 * emits as `dist/worker.js` — those two are the same claim about the same set,
 * which is why adding a name here is the single act that can break NF-005.
 *
 * DELIBERATELY NOT ON THE BARREL (`src/index.ts`): widening the pinned `.`
 * surface for a build-tooling concern is not free, and AC-04 pins the barrel's
 * export set exactly. Consumers of the worker entry get these names from
 * `@siteable/core/worker` instead.
 *
 * `export-html.ts` reaches `downloadHTML`/`previewHTML`, which touch
 * `document`/`window`. They are safe to IMPORT in a worker and are never CALLED
 * there (nothing in this closure invokes them); the claim is about the bundle,
 * not about `document` existing. `renderDocument` itself is pure string work.
 */

/** FR-001 — one rendered page: its published path and its complete HTML document. */
export { type PageDocument, exportSitePages } from './export-site-pages'

/** FR-002 — the published URL per page, and the raw-path shape predicate. */
export { normalizePagePaths, isValidPagePath } from './page-path'

/** The two types in the renderer's signature, so a consumer need not import the main entry. */
export type { SiteConfig } from '@/blocks/types'
export type { ExportSiteOptions } from './export-html'
