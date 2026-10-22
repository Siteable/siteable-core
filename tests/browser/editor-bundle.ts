import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Builds a browser bundle of an editor harness so a spec can mount real editor
 * components in Chromium. Uses Vite's JS API with `write: false`, so nothing
 * touches disk and no dev server or config change is needed.
 */
export async function buildEditorBundle(entry: string): Promise<string> {
  const { build } = await import('vite')
  const react = (await import('@vitejs/plugin-react')).default
  const root = fileURLToPath(new URL('../..', import.meta.url))
  const result = await build({
    configFile: false,
    root,
    mode: 'production',
    logLevel: 'silent',
    plugins: [react()],
    resolve: { alias: { '@': resolve(root, 'src') } },
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      minify: true,
      target: 'esnext',
      cssCodeSplit: false,
      lib: { entry: resolve(root, entry), formats: ['es'], fileName: 'bundle' },
    },
  })
  const outputs = Array.isArray(result) ? result : [result]
  for (const out of outputs) {
    if ('output' in out) {
      const chunk = out.output.find((o) => o.type === 'chunk')
      if (chunk && chunk.type === 'chunk') return chunk.code
    }
  }
  throw new Error('Editor bundle produced no JavaScript chunk')
}
