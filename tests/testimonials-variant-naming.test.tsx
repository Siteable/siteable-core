import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { TestimonialsBlock } from '../src/blocks/testimonials/TestimonialsBlock'
import { blockMetadata } from '../src/lib/block-metadata'
import type { BlockConfig } from '../src/blocks/types'

// The testimonials `carousel` variant is a static look with no export support;
// the interactive carousel is a separate feature behind `props.display`. The
// variant was renamed to `scroller` so the two no longer share a word. These
// tests pin both halves of that rename: the new name works, and a project
// saved under the old name keeps rendering instead of silently falling back.

function block(variant: string): BlockConfig {
  return {
    id: 't1',
    type: 'testimonials',
    variant,
    props: {
      title: 'What customers say',
      items: [
        { name: 'A', quote: 'first quote' },
        { name: 'B', quote: 'second quote' },
      ],
    },
  } as BlockConfig
}

const testimonialsMeta = blockMetadata.find((b) => b.type === 'testimonials')

describe('testimonials variant naming', () => {
  it('offers scroller and no longer offers carousel', () => {
    expect(testimonialsMeta?.variants).toContain('scroller')
    expect(testimonialsMeta?.variants).not.toContain('carousel')
  })

  it('renders the scroller variant', () => {
    const html = renderToString(<TestimonialsBlock block={block('scroller')} />)
    expect(html.length).toBeGreaterThan(0)
    expect(html).toContain('first quote')
  })

  it('keeps rendering a project saved under the old carousel name', () => {
    // Same output as `scroller`, so an old config is not silently downgraded
    // to the default layout.
    const legacy = renderToString(<TestimonialsBlock block={block('carousel')} />)
    const current = renderToString(<TestimonialsBlock block={block('scroller')} />)
    expect(legacy).toBe(current)
  })

  it('does not confuse the variant with the display option', () => {
    // `display` selects the interactive carousel feature; `variant` selects the
    // static look. A block with no `display` must never render interactive
    // controls, whichever variant it carries.
    for (const variant of ['scroller', 'carousel', 'cards', 'spotlight']) {
      const html = renderToString(<TestimonialsBlock block={block(variant)} />)
      expect(html).not.toContain('data-sb-tab')
      expect(html).not.toContain('data-sb-carousel')
    }
  })
})
