import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readme = readFileSync(resolve(__dirname, '../README.md'), 'utf8')
const section = readme.slice(
  readme.indexOf('### SEO head and `siteUrl`'),
  readme.indexOf('### `features` block'),
)

describe('README documents the SEO head', () => {
  it('names the option, the canonical link, the JSON-LD and the font fallback', () => {
    expect(section.length).toBeGreaterThan(0)
    for (const term of ['siteUrl', 'rel="canonical"', 'JSON-LD', 'fetchpriority', '<noscript>']) {
      expect(section).toContain(term)
    }
  })
})
