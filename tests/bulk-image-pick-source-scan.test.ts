/**
 * The bulk image pick source files stay inert: they never load, fetch or navigate
 * to the image URLs they handle. This list is stricter than the shared scan of the
 * same folders and covers only the bulk files.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const BULK_FILES = [
  'src/editor/image-pick/picked-image-entries.ts',
  'src/editor/image-pick/run-bulk-image-pick.ts',
  'src/editor/card-grid-items-editor/card-grid-bulk-add-button.tsx',
]

const FORBIDDEN: Array<[string, RegExp]> = [
  ['fetch(', /\bfetch\(/],
  ['XMLHttpRequest', /XMLHttpRequest/],
  ['WebSocket', /WebSocket/],
  ['sendBeacon', /sendBeacon/],
  ['localStorage', /localStorage/],
  ['sessionStorage', /sessionStorage/],
  ['indexedDB', /indexedDB/],
  ['eval(', /\beval\(/],
  ['new Function', /new Function/],
  ['dynamic import', /\bimport\(/],
  ['innerHTML', /innerHTML/],
  ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
  ['window.open', /window\.open/],
  ['new Image', /new Image\b/],
  ['Image(', /\bImage\(/],
  ['createElement(', /createElement\(/],
  ['navigator.', /\bnavigator\./],
  ['postMessage', /postMessage/],
  ['new Request', /new Request\b/],
  ['setTimeout with a string', /setTimeout\(\s*['"`]/],
  ['globalThis[', /globalThis\[/],
  ['window[', /\bwindow\[/],
  ['.src =', /\.src\s*=[^=]/],
]

const read = (f: string) => readFileSync(f, 'utf8')

describe('bulk image pick source scan', () => {
  it.each(BULK_FILES)('%s exists', (file) => {
    expect(statSync(file).isFile()).toBe(true)
  })

  it.each(FORBIDDEN)('no bulk file uses %s', (_label, pattern) => {
    const offenders = BULK_FILES.filter((f) => pattern.test(read(f)))
    expect(offenders).toEqual([])
  })

  it.each(['src/editor/image-pick', 'src/editor/card-grid-items-editor'])(
    'the %s folder has no subfolder the shared scan would skip',
    (dir) => {
      const subdirs = readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory())
      expect(subdirs).toEqual([])
    },
  )
})
