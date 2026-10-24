import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readme = readFileSync(resolve(__dirname, '../README.md'), 'utf8')
const section = readme.slice(
  readme.indexOf('### Adding many products from images'),
  readme.indexOf('### Server / worker usage'),
)

describe('README documents the bulk image pick hook', () => {
  it('has a dedicated section that names the hook, the entry type and the button', () => {
    expect(section.length).toBeGreaterThan(0)
    for (const term of ['onPickImages', 'PickedImageEntry', '+ Add from many images']) {
      expect(section).toContain(term)
    }
  })

  it('describes the dismissed, failed, written and discarded outcomes', () => {
    for (const term of ['Dismissed', 'Failed', 'Written', 'Discarded']) expect(section).toContain(`**${term}:**`)
  })

  it('states that the returned promise must settle', () => {
    expect(section).toMatch(/MUST settle/)
  })
})
