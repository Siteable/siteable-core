/**
 * SC-006 — golden markup fixtures for the six new renderers, per variant.
 *
 * Spec: `specs/publish-fidelity/spec.md`. Phase-03 of the publish-fidelity plan.
 *
 * The fixtures under `tests/fixtures/export-blocks-golden/` are committed
 * reviewed output, NOT opaque `toMatchSnapshot()` blobs — each was read line by
 * line before being committed. Regenerate deliberately with:
 *
 *   UPDATE_GOLDEN=1 npx vitest run tests/export-blocks-golden.test.ts
 *
 * then re-run without the env var to confirm the committed fixtures match.
 */
import { describe, it, expect } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { BlockConfig } from '../src/blocks/types'
import { renderContent } from '../src/lib/export-blocks/render-content'
import { renderImage } from '../src/lib/export-blocks/render-image'
import { renderVideo } from '../src/lib/export-blocks/render-video'
import { renderGallery } from '../src/lib/export-blocks/render-gallery'
import { renderDivider } from '../src/lib/export-blocks/render-divider'
import { renderBanner } from '../src/lib/export-blocks/render-banner'

interface GoldenCase {
  type: BlockConfig['type']
  variant: string
  props: Record<string, unknown>
  render: (block: BlockConfig) => string
}

const CASES: GoldenCase[] = [
  {
    type: 'content',
    variant: 'prose',
    render: renderContent,
    props: { body: '## Heading\n\nA **bold** word and *italic* word.\n\n- One\n- Two' },
  },
  {
    type: 'content',
    variant: 'columns',
    render: renderContent,
    props: { body: '## Left\n\nFirst para.\n\n## Right\n\nSecond para.' },
  },
  {
    type: 'content',
    variant: 'highlight',
    render: renderContent,
    props: { body: 'Important **notice** here.' },
  },
  {
    type: 'image',
    variant: 'hero-image',
    render: renderImage,
    props: {
      src: 'https://cdn.example.com/hero.png',
      alt: 'Hero',
      title: 'Title',
      subtitle: 'Sub',
    },
  },
  {
    type: 'image',
    variant: 'side-by-side',
    render: renderImage,
    props: {
      src: 'https://cdn.example.com/side.png',
      alt: 'Side',
      title: 'Side title',
      subtitle: 'Side sub',
      imageSide: 'left',
    },
  },
  {
    type: 'image',
    variant: 'grid',
    render: renderImage,
    props: {
      title: 'Grid',
      images: [
        { src: 'https://cdn.example.com/1.png', alt: 'one' },
        { src: 'data:image/png;base64,x', alt: 'two' },
        { alt: 'three' },
      ],
    },
  },
  {
    type: 'video',
    variant: 'youtube',
    render: renderVideo,
    props: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Watch' },
  },
  {
    type: 'video',
    variant: 'vimeo',
    render: renderVideo,
    props: { url: 'https://vimeo.com/123456789', title: 'Vimeo' },
  },
  {
    type: 'gallery',
    variant: 'grid',
    render: renderGallery,
    props: {
      title: 'Gallery',
      images: [
        { src: 'https://cdn.example.com/a.png', alt: 'a', caption: 'Cap A' },
        { src: '', alt: 'b', caption: '' },
      ],
    },
  },
  {
    type: 'gallery',
    variant: 'masonry',
    render: renderGallery,
    props: {
      title: 'Gallery',
      images: [
        { src: 'https://cdn.example.com/a.png', alt: 'a', caption: 'Cap A' },
        { src: '', alt: 'b', caption: '' },
      ],
    },
  },
  { type: 'divider', variant: 'line', render: renderDivider, props: { height: 60, width: 'full' } },
  { type: 'divider', variant: 'space', render: renderDivider, props: { height: 40 } },
  { type: 'divider', variant: 'dots', render: renderDivider, props: { height: 80 } },
  {
    type: 'banner',
    variant: 'ribbon',
    render: renderBanner,
    props: { text: 'Ribbon text', linkText: 'Go', linkUrl: '#' },
  },
  {
    type: 'banner',
    variant: 'bar',
    render: renderBanner,
    props: { text: 'Bar text', linkText: 'Go', linkUrl: 'https://example.com' },
  },
]

const FIXTURE_DIR = resolve(import.meta.dirname, 'fixtures/export-blocks-golden')
const UPDATE = Boolean(process.env.UPDATE_GOLDEN)

// UPDATE_GOLDEN is a deliberate local escape hatch for regenerating fixtures
// after an intended markup change (see the file header). In CI it would turn
// this suite into a silent no-op — every case would rewrite its fixture and
// assert `true`, so SC-006 would pass without comparing anything. Fail closed
// instead: if the variable is set alongside CI, refuse to run rather than
// report a green suite that proved nothing.
if (UPDATE && process.env.CI) {
  throw new Error(
    'UPDATE_GOLDEN is set while CI is set — the golden suite would rewrite its ' +
      'fixtures and assert nothing. Unset UPDATE_GOLDEN to run the real comparison.',
  )
}

describe('SC-006 — golden markup for the six new renderers', () => {
  for (const c of CASES) {
    it(`${c.type}-${c.variant}`, () => {
      const actual = c.render({ id: 'b', type: c.type, variant: c.variant, props: c.props })
      const file = resolve(FIXTURE_DIR, `${c.type}-${c.variant}.html`)

      if (UPDATE) {
        mkdirSync(FIXTURE_DIR, { recursive: true })
        writeFileSync(file, actual, 'utf8')
        expect(true).toBe(true)
        return
      }

      const expected = readFileSync(file, 'utf8')
      expect(actual).toBe(expected)
    })
  }
})
