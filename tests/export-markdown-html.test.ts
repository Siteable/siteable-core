/**
 * SC-007 / SC-008 — the markdown-subset → HTML STRING renderer.
 *
 * Spec: `specs/publish-fidelity/spec.md` Constraints (markdown subset, no raw
 * HTML passthrough). Phase: `plans/261005-0718-.../phase-03-...md`.
 * Module under test: `src/lib/markdown-html.ts`.
 */
import { describe, it, expect } from 'vitest'
import { renderMarkdownToHtml } from '../src/lib/markdown-html'
import { exportSiteToHTML } from '../src/lib/export-html'
import { renderContent } from '../src/lib/export-blocks/render-content'
import type { SiteConfig } from '../src/blocks/types'

describe('SC-007 — a <script> in the input is escaped, bold still renders', () => {
  it('never emits a literal <script and still produces <strong>', () => {
    const out = renderMarkdownToHtml(
      'Intro <script>alert(1)</script> and **bold** here.'
    )
    expect(out).not.toContain('<script')
    expect(out).toContain('<strong')
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
})

describe('SC-008 — every supported construct escapes its literal < and &', () => {
  const md = [
    '## Head < one & two',
    '',
    '### Sub < three & four',
    '',
    'Para **bold < & >** and *italic < & >* done.',
    '',
    '- item < one & two',
    '* item * three & four',
  ].join('\n')

  const out = renderMarkdownToHtml(md)

  it('emits the structural tags for each construct', () => {
    expect(out).toContain('<h2')
    expect(out).toContain('<h3')
    expect(out).toContain('<p')
    expect(out).toContain('<ul')
    expect(out).toContain('<li')
    expect(out).toContain('<strong')
    expect(out).toContain('<em')
  })

  it('escapes every literal < and & from the input', () => {
    // Input carries five literal `<` and six literal `&`; each must surface as
    // an entity, so no raw `<`/`&` from the input survives.
    expect((out.match(/&lt;/g) || []).length).toBe(5)
    expect((out.match(/&amp;/g) || []).length).toBe(6)
    expect(out).toContain('&lt;')
    expect(out).toContain('&amp;')
  })

  it('leaks no input-derived raw tag', () => {
    expect(out).not.toContain('<script')
    expect(out).not.toMatch(/<(?:script|img|a )/i)
  })
})

describe('SC-007 integration — a content block exported through exportSiteToHTML', () => {
  it('escapes the body (page chrome holds its own legitimate scripts)', () => {
    const config: SiteConfig = {
      name: 'Markdown Escape',
      blocks: [
        {
          id: 'c1',
          type: 'content',
          variant: 'prose',
          props: { body: 'Danger <script>alert(1)</script> text.' },
        },
      ],
    }
    const html = exportSiteToHTML(config)

    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
})

/**
 * REVIEW2 Medium #2 — regression guard for `renderContent`'s `columns` variant.
 *
 * `renderMarkdownToHtml` joins top-level elements with `\n`, and the columns
 * variant splits that string on `\n` assuming every element is single-line. A
 * multi-item list is ONE element whose `<li>`s carry no newlines, so it must
 * stay whole inside a single column half. A split mid-element would leave a
 * `<ul>` unclosed at a `</div>` boundary.
 */
describe('columns variant — a list element is never split across column halves', () => {
  const out = renderContent({
    id: 'col-1',
    type: 'content',
    variant: 'columns',
    props: { body: '## A\n\nIntro.\n\n- one\n- two\n- three\n\n## B\n\nOutro.' },
  })

  it('keeps the whole list contiguous inside one column', () => {
    expect(out).toContain(
      '<ul class="list-disc list-inside space-y-1 mb-4 text-text-1"><li>one</li><li>two</li><li>three</li></ul>'
    )
  })

  it('leaves no <ul> unclosed at a </div> boundary', () => {
    expect(out).not.toMatch(/<ul[^>]*>(?:(?!<\/ul>)[\s\S])*<\/div>/)
  })
})
