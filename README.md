# @siteable/core

A visual website builder engine: 19 typed block components, a drag-edit canvas, theme
presets, AI generation, and a one-click HTML export. JSON is the source of truth — every
edit produces clean, diffable JSON that humans and AI agents can both read and write.

**Live demo:** try the engine running as a bare third-party consumer at
[demo.siteable.app](https://demo.siteable.app) — source in
[Siteable/siteable-demo](https://github.com/Siteable/siteable-demo) (BYOK, no account needed).

## Install

```bash
npm install @siteable/core
```

## Peer Dependencies

The host app supplies these — `@siteable/core` declares them as peerDependencies but does
not bundle them. Install with caret ranges matching the package's own peer spec:

```bash
npm install react@^19.2.0 react-dom@^19.2.0 zustand@^5.0.11 immer@^11.1.4 \
            @dnd-kit/core@^6.3.1 @dnd-kit/sortable@^10.0.0 @dnd-kit/utilities@^3.2.2 \
            sonner@^2.0.7 lucide-react@^0.575.0 tailwindcss@^4.2.1
```

`react-router-dom` is **not** a peer — the engine is router-agnostic.

## Tailwind v4 Setup

Add `@source` and `@import` to your app's global CSS so Tailwind v4's scanner picks up the
package's block component classes:

```css
/* app.css */
@import "tailwindcss";

@source "./node_modules/@siteable/core/src/**/*.{ts,tsx}";
@import "@siteable/core/src/styles.css";
```

The package ships raw, unbuilt Tailwind v4 source (no precompiled CSS in `dist/`).

## Usage

```tsx
import { EditorLayout } from '@siteable/core'

function App() {
  return <EditorLayout />
}
```

`validateSiteConfig`, `generateSiteConfig`, `exportSiteToHTML`, `themePresets`,
`isAllowedUrl` (the shared `href`/`src` allow-list, plus its `UrlPolicyOptions` type), and
the two zustand stores (`useConfigStore`, `useEditorStore`) are all available from the
package entry.

### Exporting a multi-page site

`exportSitePages(config, options?)` returns one `{ path, html }` document per
page, in page order, keyed by its normalized path (`normalizePagePaths`). A
non-empty `pages` list is authoritative — top-level `blocks` is ignored. A
config with no `pages` (or an empty list) yields exactly one document at `/`
rendered from those top-level blocks.

`exportSiteToHTML` remains the single-document entry point and, for the same
rule, now renders the `/` page — which is always page 1 — instead of the
top-level `blocks`. On a multi-page config that is a behaviour change for
existing callers: the exported home page is the site's first page, not
whichever page was last mirrored into `blocks`.

**A page with no blocks exports as a blank body.** `pages` is authoritative
whenever it is a non-empty array, so if page 1's `blocks` is `undefined`, `null`
or the array is empty, the exported home page has no content — the exporter does
**not** fall back to the top-level `blocks`, because those are the stale mirror
that `pages[]` exists to supersede. Check page 1 before publishing.

**Malformed `pages` and page-level `blocks` shapes do not throw, from either
entry point, and both agree on page 1.** What they produce depends on the shape:

- `pages` that is not an array (a string, a number, an object, `null`) is treated
  as absent: one document at `/` rendered from the top-level `blocks`.
- `pages` that is an array with `null` or non-object entries: each such page
  keeps its slot but exports with an empty body, and the normalizer assigns its
  path. If that is page 1, the home page is blank (see above).
- A page whose `blocks` is not an array exports with an empty body.

**The shape of the block ELEMENTS is not guarded.** Both entry points throw a
`TypeError` on a `null` entry inside a page's `blocks`, on blocks with
no `props` (a `hero` does) or with malformed props (for example a `faq` whose
`items` contains `null`), and on a `null` or `undefined` config itself. Run
`validateSiteConfig` (main entry only) on untrusted or AI-generated input first,
and read the caveat below for what it does to it. Worker-only consumers do not
get that validator, so they must check block shape themselves.

**`validateSiteConfig` is a sanitizer for AI output, not an identity function.** It
returns a repaired config, and the repair is lossy: a page whose blocks are all
invalid (or missing) is **dropped** from the result, and an input with no valid
blocks at all is replaced by a built-in template. Dropping an early page shifts
the rest: `[Home (empty) '/', About '/about', Blog (empty), Contact '/contact']`
becomes `[About '/about', Contact '/contact']`, and `exportSitePages` then
normalizes page 1 to `/`, so About's content is served at `/` and `/about` no
longer exists. If page paths are meaningful to your callers, compare the page
list before and after validation rather than assuming it is preserved.

### Server / worker usage (`@siteable/core/worker`)

The main entry re-exports the editor components and the zustand stores, so it
carries `react`, `react-dom`, `@dnd-kit/*`, `sonner` and `lucide-react` with it.
**Server runtimes and edge/worker bundles should import from the worker entry
instead**, which exposes only the pure export functions and carries none of them:

```ts
import {
  exportSitePages,
  normalizePagePaths,
  isValidPagePath,
  type PageDocument,
  type SiteConfig,
  type ExportSiteOptions,
} from '@siteable/core/worker'
```

It ships its own `worker.d.ts`, so the entry is type-complete. The worker entry
deliberately does **not** export `validateSiteConfig` (it is only on the main
entry, and pulls in the AI generation client). The main entry still works
exactly as before for browser apps.

The package's `exports` map exposes exactly `.`, `./worker`, `./src/styles.css`
(the Tailwind setup above) and `./package.json`. Other deep paths such as
`@siteable/core/src/store/...` are not importable; use the entries above.

## Single-store invariant

`useConfigStore` and `useEditorStore` are zustand module singletons. Always import through
the package entry (`@siteable/core`) — never deep-import `@siteable/core/src/...` in an app
that also imports the package's main entry. Two copies of the same store in one app silently
produce divergent state.

## Browser Support

Modern evergreen browsers (last 2 Chrome / Firefox / Safari / Edge versions). No IE.

## Contributing

Issues and PRs welcome via [GitHub](https://github.com/Siteable/siteable-core/issues).

Workflow (GitHub Flow, single `main`):

- All changes land via PR — `main` is protected, direct pushes are rejected.
- Required status checks on every PR: `typecheck`, `test`, `build`,
  `secret-scan` (all four must pass; admins are not exempt).
- **Squash-merge only** — merge commits and rebase-merge are disabled; the
  squash commit message is the PR title (PR description and co-author
  trailers are intentionally not carried into `main` history). Use a
  Conventional Commit-style PR title (`feat:`, `fix:`, `docs:`, …) — it
  becomes the permanent `main` history entry.

## License

MIT — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

---

### Provenance

This is the engine subset extracted from
[OpenPage](https://github.com/buildingopen/openpage). The MIT body, attribution, and
adopted-conventions headers carry over from that codebase; the package is maintained
independently under the `@siteable` npm scope with `Siteable Contributors` as the copyright
holder (see NOTICE for the full lineage statement).
