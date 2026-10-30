import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readme = readFileSync(resolve(__dirname, '../README.md'), 'utf8')
const start = readme.indexOf('### `facebook-page` block')
const section = readme.slice(start, readme.indexOf('### Image picking'))

describe('README documents the facebook-page block', () => {
  it('names the function, the URL forms, the frame attributes and the limits', () => {
    expect(start).toBeGreaterThan(-1)
    for (const term of [
      'facebook-page',
      'facebookPageEmbedUrl',
      'profile.php',
      'loading="lazy"',
      'strict-origin-when-cross-origin',
      '340',
      '70-800',
      'placeholder',
      'may not show a Page timeline',
      'blur or Enter',
      'must be public',
      "visitor's browser contacts Facebook",
      'https://www.facebook.com/acme',
    ]) {
      expect(section, term).toContain(term)
    }
  })
})
