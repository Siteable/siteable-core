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
      expect(html, variant).not.toContain('data-sb-tab')
      expect(html, variant).not.toContain('data-sb-carousel')
      // The hook assertions above can only see export markup, which the editor
      // never emits; this line is what actually fails if a region renders
      // without the `display` option.
      expect(html, variant).not.toContain('aria-roledescription="carousel"')
    }
  })

  it('names the carousel region by aria-label when the title is explicitly empty', () => {
    // The exporter treats an empty title as no title (`hasTitle` on the text),
    // so the preview must not invent a heading the exported page lacks. A
    // subtitle still renders: the exporter's header gate is `heading || subline`.
    const base = block('cards')
    const html = renderToString(
      <TestimonialsBlock
        block={{ ...base, props: { ...base.props, title: '', subtitle: 'Kind words', display: 'carousel' } }}
      />,
    )
    expect(html).toContain('aria-label="Carousel"')
    expect(html).toContain('Kind words')
    expect(html).not.toContain('<h2')
  })

  it('renders hostile prop types without throwing or leaking a value', () => {
    // The JSON drawer can store any type in a prop; the exporter coerces every
    // field through its own guards, so the preview must not fall into the block
    // error boundary or print an object.
    const base = block('cards')
    const html = renderToString(
      <TestimonialsBlock
        block={{
          ...base,
          props: {
            ...base.props,
            title: 123,
            display: 'carousel',
            items: [null, { name: 7, role: {}, quote: { text: 'x' } }],
          },
        }}
      />,
    )
    expect(html).not.toContain('<h2')
    expect(html).not.toContain('[object Object]')
    expect(html).toContain('aria-label="Carousel"')
  })

  it('renders the interactive carousel for every variant when display asks for it', () => {
    // The option decides, not the variant, so the static look never leaks into
    // the interactive preview and vice versa.
    for (const variant of ['cards', 'scroller', 'carousel', 'spotlight']) {
      const base = block(variant)
      const html = renderToString(
        <TestimonialsBlock block={{ ...base, props: { ...base.props, display: 'carousel' } }} />,
      )
      expect(html, variant).toContain('aria-roledescription="carousel"')
      expect(html, variant).toContain('aria-label="1 of 2"')
    }
  })
})
