import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The facebook-page sources must stay free of HTML-string injection, dynamic
 * code and unexpected imports. The shared URL function has no imports at all.
 */
const FILES = [
  'src/lib/facebook-page-embed.ts',
  'src/lib/export-blocks/render-facebook-page.ts',
  'src/blocks/facebook-page/FacebookPageBlock.tsx',
  'src/editor/facebook-page-url-field.tsx',
]
const FORBIDDEN =
  /dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|\bFunction\s*\(|new\s+Function|srcdoc|import\(/g
const ALLOWED_IMPORTS = new Set([
  'react',
  'lucide-react',
  '../types',
  '@/blocks/types',
  '@/lib/html-escape',
  '@/lib/facebook-page-embed',
  './facebook-page-embed',
])
const IMPORT_RE = /^\s*import\s[^'"]*?['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm

const read = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf8')

describe('facebook-page sources', () => {
  for (const file of FILES) {
    it(`${file} has no injection or dynamic-code use`, () => {
      expect(read(file).match(FORBIDDEN) ?? []).toEqual([])
    })
    it(`${file} imports only allowed modules`, () => {
      const specs = [...read(file).matchAll(IMPORT_RE)].map((m) => m[1] ?? m[2])
      for (const spec of specs) expect(ALLOWED_IMPORTS.has(spec), spec).toBe(true)
    })
  }

  it('the shared url function has no imports', () => {
    expect([...read(FILES[0]).matchAll(IMPORT_RE)]).toEqual([])
  })
})
