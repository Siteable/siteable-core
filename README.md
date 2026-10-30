# @siteable/core

A visual website builder engine: 20 typed block components, a drag-edit canvas, theme
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

### SEO head and `siteUrl`

`exportSitePages` and `exportSiteToHTML` accept an optional `siteUrl` in
`ExportSiteOptions`: the public origin of the published site, for example
`https://example.com`.

```ts
exportSitePages(config, { siteUrl: 'https://example.com' })
```

`siteUrl` must be a plain `http(s)` origin: `http://` or `https://` plus a host
and optional port, with at most one trailing `/` (for example
`https://example.com`, `http://localhost:3000`, `https://[::1]`). Anything else
is ignored: credentials, a backslash, quotes, angle brackets, inner whitespace,
any path (including `/.`, `/..` and `/%2e`), a query, a fragment, or a malformed
scheme such as `https:example.com`. Surrounding whitespace is trimmed. The host
of a valid value is normalized by the URL parser (lowercased, percent-decoded,
internationalized names converted to punycode, IPv4 shorthand expanded, a
default port dropped), so the canonical URL may differ in spelling from what you
passed.

- **With a valid `siteUrl`:** each page gets `<link rel="canonical">` (origin plus
  the page path), and the JSON-LD `Organization` and `WebSite` entries carry
  `url`.
- **Without it:** no canonical link is emitted and the JSON-LD entries have no
  `url`. Everything below is still emitted.
- **Always:** Twitter card tags (`summary_large_image` when an image exists), one
  JSON-LD script with `Organization` and `WebSite` (and `FAQPage` when a page has
  usable FAQ items), and image hints: `decoding="async"` on every image,
  `loading="lazy"` on all but the logo and the first hero image, and
  `fetchpriority="high"` on that first hero image. That applies to the first
  image emitted by a `hero` block (split variant); the hero-image variant of an
  `image` block stays lazy.
- **Fonts no longer block rendering.** The Google Fonts stylesheet loads through
  `rel="preload"` and switches to a stylesheet on load, with a `<noscript>`
  fallback.

Republishing a site changes the HTML of existing pages (new head tags and image
attributes), so expect a diff on the first export after upgrading.

### `features` block: opt-in tab layout

A `features` block takes an optional `display` prop. With `display: 'tabs'`
and at least two items, it renders as one accessible tab set in both the
editor preview and the exported HTML: each tab is labeled with the item's
title (`Tab N`, the item's 1-based position, when the title is empty or only
whitespace), its panel holds the item description, and the first tab is
selected. Click and Left/Right (wrapping)/Home/End move the selection.

The option is additive and opt-in. Any other `display` value, no `display`,
or fewer than two items renders the block exactly as before. The editor
exposes it as a Display select on the block (Default layout / Tabs); an
unknown value falls back to the default layout.

Exported pages that contain a rendered tab set carry the shared inline
behaviour runtime — the same script the exporter already emits for the navbar
menu and the FAQ accordion, one `<script>` per page, no external asset. With
JavaScript disabled the tab strip is hidden and every panel is shown stacked
in item order, each preceded by its title.

### `testimonials` and `gallery` blocks: opt-in carousel layout

A `testimonials` or `gallery` block takes an optional `display` prop. With
`display: 'carousel'` and at least two items, it renders as one accessible
carousel in both the editor preview and the exported HTML: one slide per item
in item order, the first slide shown, a previous and a next control, and one
slide at a time. The controls stop at the ends of the list instead of looping,
and nothing advances on its own — no autoplay timer runs. Click a control, or
press Left/Right while focus is inside the carousel, to move one slide.

The carousel is exposed as a `region` named by the block's visible heading, or
`Carousel` when the block renders no heading at all; each slide is a `group`
named by its position out of the total (`"2 of 3"`), and each control is a
button named `Previous slide` / `Next slide`. A control is `disabled` at its end of the
list, so the state is exposed rather than only drawn; when the control the
visitor just used becomes disabled, focus moves to the other control so the
keyboard path keeps working. Two carousels on one page move independently.

Every variant of both blocks renders this same carousel, so `variant` does not
change the layout. Without the option, the testimonials `scroller` variant is
unchanged and stays a separate static look.

The option is additive and opt-in. Any other `display` value, no `display`, or
fewer than two items renders the block exactly as before. The editor exposes it
as a Display select on the block (Default layout / Carousel); an unknown value
falls back to the default layout.

Exported pages that contain a rendered carousel carry the same shared inline
behaviour runtime as the navbar menu, the FAQ accordion and the tab set — one
`<script>` per page, no external asset. With JavaScript disabled the controls
are hidden and every slide is shown stacked in item order.

### `card-grid` block: product cards with an optional category filter

A `card-grid` block renders a grid of product cards. Its props are `title`,
`subtitle`, `display` and `items`, where each item is
`{ image?, alt?, name, description?, price?, category?, ctaText?, ctaUrl? }` and
every value is a plain string. `price` is a free display string and is never
parsed, so `'$12'` and `'Contact us'` are equally valid. The block has one
variant, `product`, which is also what a missing or unknown `variant` renders.

Each card shows, in this order: an image box, the category label, the name, the
description and the price. A field that is empty is left out. A call to action
is rendered only when both `ctaText` and `ctaUrl` are set and the URL passes the
same link policy as every other block; in every other case no call-to-action
element is rendered. The image box keeps a 4:3 shape and the image is lazy
loaded and cropped to fit, set inline so it holds with scripts disabled. An item
with no image, or whose image URL is not allowed, shows a placeholder, and the
image `alt` falls back to the item name. All item text is escaped.

An empty or missing `items` list renders nothing in the exported page and shows
an empty state in the editor. A block added from the palette starts with an empty
list, so it never ships sample products.

With `display: 'filter'` and at least two distinct categories (compared after
trimming and lower-casing; the first spelling is the label), the exported page
adds a row of filter buttons: an "All" button, active by default, then one
button per category in first-seen order. Clicking a button, or pressing Enter or
Space on it, shows only the cards of that category; "All" shows every card,
including uncategorised ones. The active button is exposed with `aria-pressed`,
and filter grids on one page work independently. The editor canvas always shows
every card and no buttons.

The option is additive and opt-in. Any other `display` value, no `display`, or
fewer than two distinct categories renders a plain grid with no buttons. The
editor exposes it as a Display select on the block (Default layout / Category
filter). Products are edited in a dedicated items editor with thumbnails, add,
remove, all eight fields, move up/down, duplicate, search (name, description,
category) and group by category (uncategorised last); reordering is off while
searching or grouping.

Exported pages that contain a filter grid carry the same shared inline
behaviour runtime as the navbar menu, the FAQ accordion, the tab set and the
carousel — one `<script>` per page, no external asset. With JavaScript disabled
the filter buttons are hidden and every card is shown.

### `facebook-page` block: Facebook Page timeline embed

A `facebook-page` block shows the public timeline of a Facebook Page in an
`<iframe>`. Its props are `title` (optional heading), `url` and `height`.
The block has one variant, `default`.

```ts
import { facebookPageEmbedUrl } from '@siteable/core'

facebookPageEmbedUrl('https://www.facebook.com/acme', 600) // plugin URL, or null
```

`url` must be an `https` address on `facebook.com`, `www.facebook.com` or
`m.facebook.com` with a Page path (`/acme`) or `profile.php?id=<digits>`. Any
other address, including a site-section path such as `/sharer` or `/photo`, is
refused and the block renders a placeholder instead of a frame. The frame `src` is always built
by `facebookPageEmbedUrl`, never copied from the stored value, with fixed plugin
options: timeline tab, small header, adapt to container width, cover photo
shown, no facepile, plugin width 340. The frame is 340 px wide inside a 342 px
bordered box, centred, so it fits a 390 px phone.

`height` defaults to 500 and is clamped to 70-800; a non-integer value falls
back to 500. The frame uses `loading="lazy"` and sends
`referrerpolicy="strict-origin-when-cross-origin"`, so Facebook only receives the
site origin. No script is added to the page.

The Page must be public. An accepted address can still show Facebook's own empty
state, for example for a private Page or a non-Page path. When the frame loads,
the visitor's browser contacts Facebook, so cookie and consent handling is the
site owner's call. A site that sets a `frame-src` policy must allow
`https://www.facebook.com`.

In the editor the URL field shows "may not show a Page timeline" when the
address would render the placeholder. `url` and `height` apply on blur or Enter.

### Image picking in the editor (`onPickImage`)

`<EditorLayout onPickImage={() => Promise<string | null>} />` is an optional
hook that lets the host app supply images, for example from its own media
library. The hook takes no arguments and returns one image per call.

- A string result is stored exactly as returned. The export applies the same
  image URL policy as a typed URL.
- `null`, an empty string or a whitespace-only string means nothing was chosen:
  nothing changes and no message is shown.
- A rejection, a throw, or any other non-string result (including `undefined`
  from a hook that forgets to return) leaves the field unchanged and shows one
  generic error notice.

Covered fields: the navbar and footer logo image, the hero image and the image
block source; list rows that carry a string `src`, `image`, `avatar` or `photo`
key (for example gallery and image block images, testimonial and team member
avatars, feature images); and every card-grid item image. Rows without such a
key (pricing tiers, stats, FAQ) get no control, and plain string lists such as
`logos` are not covered. Without the hook the URL inputs behave as before.

While a pick is pending the field or row is locked. The result is discarded with
a notice if the configuration was replaced with `setConfig`, an undo or redo
happened, the pick targets a page that is no longer active when it settles, the
block was removed, or the row was replaced. Changes made through other writers to
the same field are not detected. The hook must settle: a promise that never
resolves keeps the field locked.

Notices use `sonner`, so mount `<Toaster />` in the host app. Hosts replace
content with `setConfig`; `useConfigStore` exposes `configGeneration`, a counter
that changes on `setConfig`, undo and redo.

### Adding many products from images (`onPickImages`)

`<EditorLayout onPickImages={() => Promise<PickedImageEntry[] | null> | PickedImageEntry[] | null} />`
is an optional hook that lets the host app hand over many images at once, for
example from its own media library. `PickedImageEntry` is exported from the
package entry: `{ url: string; name?: string }`.

With the hook, the card-grid items editor shows a `+ Add from many images`
button next to `+ Add item`. Supplying only this hook adds no single-image
controls; `onPickImage` stays independent.

- **Dismissed:** `null` or `[]` means nothing was chosen. Nothing changes and no
  message is shown.
- **Failed:** a rejection, a throw, a non-array result, more than 100 entries, or
  no valid entry leaves the list unchanged and shows one generic error notice.
- **Written:** one product row per valid entry, in the returned order, in a single
  undo step. `image` is the trimmed URL; `name` and `alt` are the trimmed name, or
  empty without one; the other fields are empty, and extra keys are carried over
  as "+ Add item" does.
- **Discarded:** if the content changed while the picker was open (a `setConfig`,
  an undo or redo, a removed block or page, or a different active page), a notice is shown and nothing is
  written. A result that arrives after the editor was unmounted is dropped
  silently.

Entries that are not plain objects, or whose `url` is not a string or is blank,
are skipped; a `name` that is not a string or is blank counts as no name.

The editor only stores the trimmed `url` and never fetches it or checks its scheme,
so return URLs you trust and validate them in your picker before resolving.

Only one bulk pick can be pending per block; other blocks and single-image picks
are independent. The returned promise MUST settle (resolve or reject) on every
exit of the host's picker, including close, cancel and errors: while it is
pending the button stays disabled for that block, and on a freshly loaded
document nothing else releases it. After an undo a second click may call the
hook again, so keep a single pending dialog.

```tsx
<EditorLayout
  onPickImages={async () => [
    { url: 'https://cdn.example.com/red-sneaker.webp', name: 'Red sneaker' },
    { url: 'https://cdn.example.com/photo-02.jpg' },
  ]}
/>
```

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
- Run the suites locally before opening a PR:
  - `npm test` — unit and DOM tests (vitest + jsdom)
  - `npm run test:e2e` — end-to-end visitor flows on the exported document
  - `npm run test:browser` — real-browser checks: layout, tap-target size, the
    accessibility tree, and rendering with JavaScript disabled (Playwright +
    Chromium; run `npx playwright install chromium` once)
  - `npm run typecheck` and `npm run build`
- The `browser` job runs on every PR but is **not** a required check, so a
  runner or CDN hiccup cannot block a merge. A red `browser` run is still a
  real signal — treat it as one.
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
