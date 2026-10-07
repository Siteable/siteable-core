import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { resolve } from 'node:path'

/**
 * Vite library-mode build for @siteable/core.
 *
 * - TWO ESM entries: `src/index.ts` (the barrel, `dist/index.js`) and
 *   `src/lib/worker-entry.ts` (`dist/worker.js`). FR-C1: the barrel re-exports
 *   React components and zustand stores, and `preserveModules: false` flattens
 *   it into one artifact whose top-level imports force React into EVERY
 *   consumer. A Worker (for example a Cloudflare Worker) has no React runtime, so the
 *   worker gets its own entry whose closure is the pure export functions only.
 *   `package.json`'s `exports` map routes `@siteable/core/worker` here.
 * - React + all peerDependencies are EXTERNAL — consumers supply them. That is
 *   correct for the barrel; the worker entry imports NONE of them, which is the
 *   claim `tests/export-runtime-deps.test.ts` proves against the built artifact.
 * - `@` alias re-declared to match the package-scope imports used in the source.
 * - `vite-plugin-dts` rolls up `.d.ts` declarations next to JS in dist/. It runs
 *   once per entry, so BOTH `index.d.ts` and `worker.d.ts` must be emitted —
 *   `tests/package-manifest.test.ts` and the build gate both check this.
 * - CSS extraction is forced OFF (NF-001: dist contains 0 CSS files). Consumers
 *   import the raw `src/styles.css` via Tailwind v4 `@source` + `@import`.
 */
export default defineConfig({
  plugins: [
    react(),
    dts({
      tsconfigPath: resolve(__dirname, 'tsconfig.json'),
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
  build: {
    target: 'esnext',
    cssCodeSplit: false,
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        worker: resolve(__dirname, 'src/lib/worker-entry.ts'),
      },
      name: '@siteable/core',
      formats: ['es'],
      // A named `fileName` (not the old flat `() => 'index.js'`) so each
      // entry keeps its own filename and `package.json`'s exports map can point
      // at a real file.
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: [
        'react',
        'react/jsx-runtime',
        'react-dom',
        'zustand',
        'zustand/middleware',
        'immer',
        '@dnd-kit/core',
        '@dnd-kit/sortable',
        '@dnd-kit/utilities',
        'sonner',
        'lucide-react',
        'tailwindcss',
      ],
      output: {
        preserveModules: false,
      },
    },
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
