/**
 * Guards future emitters: every `<img` literal in the exporter sources must go
 * through `imgHintAttrs`.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sources(p)
    return /\.ts$/.test(name) ? [p] : []
  })
}

describe('exporter <img> literals', () => {
  it('each template literal emitting <img goes through imgHintAttrs', () => {
    const offenders: string[] = []
    for (const file of sources('src/lib')) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
        if (!/`[^`]*<img\s/.test(line) && !/^\s*[?:]?\s*`<img\s/.test(line)) return
        if (!line.includes('imgHintAttrs(')) offenders.push(`${file}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
