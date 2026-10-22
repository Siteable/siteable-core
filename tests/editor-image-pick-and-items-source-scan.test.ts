/**
 * The image pick and card grid items editor modules stay inert: no network, storage,
 * code evaluation, navigation or HTML injection APIs.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIRS = ['src/editor/image-pick', 'src/editor/card-grid-items-editor']

const FORBIDDEN: Array<[string, RegExp]> = [
  ['fetch(', /\bfetch\(/],
  ['XMLHttpRequest', /XMLHttpRequest/],
  ['WebSocket', /WebSocket/],
  ['sendBeacon', /sendBeacon/],
  ['localStorage', /localStorage/],
  ['sessionStorage', /sessionStorage/],
  ['indexedDB', /indexedDB/],
  ['caches.', /\bcaches\./],
  ['FormData', /FormData/],
  ['eval(', /\beval\(/],
  ['new Function', /new Function/],
  ['dynamic import', /\bimport\(/],
  ['innerHTML', /innerHTML/],
  ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
  ['window.open', /window\.open/],
  ['location', /\bwindow\.location\b|\blocation\.(href|assign|replace)\b/],
]

const files = DIRS.flatMap((dir) =>
  readdirSync(dir).map((name) => join(dir, name)),
)

describe('image pick and items editor source scan', () => {
  it('scans a non-trivial number of files', () => {
    expect(files.length).toBeGreaterThanOrEqual(10)
  })

  it.each(FORBIDDEN)('no file uses %s', (_label, pattern) => {
    const offenders = files.filter((f) => pattern.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
