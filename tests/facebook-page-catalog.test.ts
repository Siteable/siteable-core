/**
 * The Facebook Feed block in the block catalog, the validator and the
 * generation prompt, and the agreement between the validated and raw export
 * paths on the frame height.
 */
import { describe, it, expect } from 'vitest'
import { blockMetadata } from '../src/lib/block-metadata'
import { validateSiteConfig } from '../src/lib/generate-site'
import { GENERATION_PROMPT } from '../src/lib/generation-prompt'
import { exportSiteToHTML } from '../src/lib/export-html'
import type { BlockConfig, SiteConfig } from '../src/blocks/types'

function validate(props: Record<string, unknown>, variant = 'default'): BlockConfig {
  const config = validateSiteConfig(
    { name: 'Acme', blocks: [{ type: 'facebook-page', variant, props }] },
    'acme site'
  )
  const blocks = config.pages?.[0]?.blocks ?? config.blocks
  return blocks[0]
}

function frameHeight(config: SiteConfig): string | null {
  const html = exportSiteToHTML(config)
  return new DOMParser().parseFromString(html, 'text/html').querySelector('iframe')?.getAttribute('height') ?? null
}

describe('facebook page block catalog entry', () => {
  const meta = blockMetadata.find((b) => (b.type as string) === 'facebook-page')

  it('is listed with its label, category, single variant and string defaults', () => {
    expect(meta).toBeDefined()
    expect(meta?.label).toBe('Facebook Feed')
    expect(meta?.category).toBe('Media')
    expect(meta?.variants).toEqual(['default'])
    expect(meta?.defaultProps).toEqual({ url: '', title: '', height: '500' })
  })

  it('declares no link arrays', () => {
    expect(meta).toBeDefined()
    expect((meta as { linkArrays?: unknown }).linkArrays).toBeUndefined()
  })
})

describe('facebook page block validation', () => {
  it('keeps the block with its type, variant, address and title', () => {
    const block = validate({ url: 'https://www.facebook.com/acme', title: 'Feed', height: 600 })
    expect(block.type).toBe('facebook-page')
    expect(block.variant).toBe('default')
    expect(block.props.url).toBe('https://www.facebook.com/acme')
    expect(block.props.title).toBe('Feed')
  })

  it('stores a numeric height as a digit string', () => {
    expect(validate({ url: 'https://www.facebook.com/acme', height: 600 }).props.height).toBe('600')
  })

  it('keeps string heights as typed', () => {
    for (const h of ['600', '1e3', 'abc']) {
      expect(validate({ url: 'https://www.facebook.com/acme', height: h }).props.height).toBe(h)
    }
  })

  it('fills a missing height with the default', () => {
    expect(validate({ url: 'https://www.facebook.com/acme' }).props.height).toBe('500')
  })

  it('replaces an unknown variant with the default one', () => {
    expect(validate({ url: 'https://www.facebook.com/acme' }, 'wide').variant).toBe('default')
  })

  it('lists the block in the generation prompt with its props', () => {
    expect(GENERATION_PROMPT).toContain('facebook-page (variants: default) - props: { url, title?, height? }')
  })
})

describe('validated and raw export agree on the frame height', () => {
  const INPUTS: unknown[] = [600, '600', '1e3', '0x20', '400.5', 400.5]
  for (const height of INPUTS) {
    it(`renders the same frame height for ${JSON.stringify(height)}`, () => {
      const props = { url: 'https://www.facebook.com/acme', height }
      const raw: SiteConfig = {
        name: 'Acme',
        blocks: [{ id: 'f', type: 'facebook-page', variant: 'default', props } as BlockConfig],
      }
      const validated = validateSiteConfig({ name: 'Acme', blocks: [{ type: 'facebook-page', variant: 'default', props }] }, 'acme site')
      const rawHeight = frameHeight(raw)
      expect(rawHeight).not.toBeNull()
      expect(frameHeight(validated)).toBe(rawHeight)
    })
  }

  it('resolves the ambiguous strings to the default height on both paths', () => {
    for (const height of ['1e3', '0x20', '400.5', 400.5]) {
      const props = { url: 'https://www.facebook.com/acme', height }
      const validated = validateSiteConfig({ name: 'Acme', blocks: [{ type: 'facebook-page', variant: 'default', props }] }, 'acme site')
      expect(frameHeight(validated), String(height)).toBe('500')
    }
  })
})
