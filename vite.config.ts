import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { resolve } from 'node:path'

/**
 * Vite library-mode build for @siteable/core.
 *
 * - Single ESM entry: src/index.ts (the barrel).
 * - React + all peerDependencies are EXTERNAL — consumers supply them.
 * - `@` alias re-declared to match the package-scope imports used in the source.
 * - `vite-plugin-dts` rolls up `.d.ts` declarations next to JS in dist/.
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
      entry: resolve(__dirname, 'src/index.ts'),
      name: '@siteable/core',
      formats: ['es'],
      fileName: () => 'index.js',
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
