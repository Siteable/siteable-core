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

`validateSiteConfig`, `generateSiteConfig`, `exportSiteToHTML`, `themePresets`, and the
two zustand stores (`useConfigStore`, `useEditorStore`) are all available from the package
entry.

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
- Required status checks on every PR: `verify` and `secret-scan`.
- **Squash-merge only** — merge commits and rebase-merge are disabled; the
  squash commit message is the PR title. Use a Conventional Commit-style PR
  title (`feat:`, `fix:`, `docs:`, …) — it becomes the permanent `main`
  history entry.

## License

MIT — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

---

### Provenance

This is the engine subset extracted from
[OpenPage](https://github.com/buildingopen/openpage). The MIT body, attribution, and
adopted-conventions headers carry over from that codebase; the package is maintained
independently under the `@siteable` npm scope with `Siteable Contributors` as the copyright
holder (see NOTICE for the full lineage statement).
