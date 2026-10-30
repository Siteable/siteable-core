/**
 * Hostile props for the exported Facebook Feed block.
 *
 * Titles from the shared hostile corpus are crossed with the page address
 * corpus and exported through the real export path. Nothing hostile may become
 * a live handler, a new script, or an unescaped attribute; the frame address
 * always comes from the shared embed function.
 */
import { describe, it, expect } from 'vitest'
import { exportSiteToHTML } from '../src/lib/export-html'
import { escapeHtml } from '../src/lib/html-escape'
import { facebookPageEmbedUrl } from '../src/lib/facebook-page-embed'
import type { BlockConfig, SiteConfig } from '../src/blocks/types'
import {
  FACEBOOK_PAGE_TITLE_CORPUS,
  FACEBOOK_PAGE_URL_CORPUS,
} from './helpers/facebook-page-injection-corpus'

const parse = (doc: string): Document => new DOMParser().parseFromString(doc, 'text/html')

function exportFeed(props: Record<string, unknown>): string {
  const block = { id: 'feed', type: 'facebook-page', variant: 'default', props } as BlockConfig
  return exportSiteToHTML({ name: 'Site', blocks: [block] } as SiteConfig)
}

const countScripts = (html: string): number => (html.match(/<script/gi) ?? []).length

/**
 * Live event-handler attributes, read from the parsed DOM so that escaped text
 * inside an attribute value (e.g. a title) is not mistaken for a handler.
 * The fixed font preload onload and the form onsubmit are expected.
 */
const handlers = (html: string | Document): string[] =>
  [...(typeof html === 'string' ? parse(html) : html).querySelectorAll('*')].flatMap((el) =>
    [...el.attributes]
      .filter((a) => a.name.startsWith('on'))
      .map((a) => `${a.name}=${a.value}`)
      .filter((a) => a !== `onload=this.onload=null;this.rel='stylesheet'` && a !== 'onsubmit=return false'),
  )

const BASELINE_HTML = exportSiteToHTML({ name: 'Site', blocks: [] } as SiteConfig)
const BASELINE_SCRIPTS = countScripts(BASELINE_HTML)

describe('facebook page block with hostile props', () => {
  it('has a non-empty title corpus and url corpus', () => {
    expect(FACEBOOK_PAGE_TITLE_CORPUS.length).toBeGreaterThan(10)
    expect(FACEBOOK_PAGE_URL_CORPUS.length).toBeGreaterThan(10)
  })

  it('keeps every title x address combination inert and well-formed', () => {
    for (const title of FACEBOOK_PAGE_TITLE_CORPUS) {
      for (const row of FACEBOOK_PAGE_URL_CORPUS) {
        const html = exportFeed({ url: row.input, title, height: '500' })
        const label = `${JSON.stringify(title.slice(0, 40))} x ${JSON.stringify(row.input.slice(0, 60))}`
        expect(html, label).not.toContain('Unknown block type')
        const doc = parse(html)
        expect(handlers(doc), label).toEqual([])
        expect(countScripts(html), label).toBe(BASELINE_SCRIPTS)
        const raw = title.trim() === '' ? null : title
        // Short titles such as `">` also occur in the fixed page shell, so only check
        // titles that the shell does not already contain.
        if (raw !== null && /[<>"']/.test(raw) && !BASELINE_HTML.includes(raw)) {
          expect(html, label).not.toContain(raw)
        }
        const frames = [...doc.querySelectorAll('iframe')]
        if (row.expected === null) {
          expect(frames, label).toHaveLength(0)
        } else {
          expect(frames, label).toHaveLength(1)
          const src = frames[0].getAttribute('src')
          expect(src, label).toBe(facebookPageEmbedUrl(row.input, '500'))
          expect(new URL(src as string).searchParams.get('href'), label).toBe(row.expected)
        }
      }
    }
  }, 30000)

  it('writes the title only in escaped form', () => {
    const title = ['"><img src=x on', 'error=alert(1)>'].join('')
    const html = exportFeed({ url: 'https://www.facebook.com/acme', title })
    expect(html).toContain(escapeHtml(title))
    expect(html).not.toContain(title)
    expect(handlers(html)).toEqual([])
  })

  it('does not crash on non-string props', () => {
    const cases: Array<Record<string, unknown>> = [
      { url: { href: 'https://www.facebook.com/acme' }, title: 'T' },
      { url: 'https://www.facebook.com/acme', height: '"><b>' },
      { url: 'https://www.facebook.com/acme', title: 5 },
      { url: null, title: null, height: null },
      { url: ['https://www.facebook.com/acme'], height: {} },
      {},
    ]
    for (const props of cases) {
      const html = exportFeed(props)
      const label = JSON.stringify(props)
      expect(html, label).not.toContain('Unknown block type')
      expect(handlers(html), label).toEqual([])
      expect(countScripts(html), label).toBe(BASELINE_SCRIPTS)
      expect(html, label).not.toContain('<b>')
      expect(html, label).not.toContain('[object Object]')
      for (const frame of parse(html).querySelectorAll('iframe')) {
        const src = frame.getAttribute('src') as string
        expect(src.startsWith('https://www.facebook.com/plugins/page.php?'), label).toBe(true)
        expect(frame.getAttribute('height'), label).toMatch(/^\d+$/)
      }
    }
  })

  it('renders the placeholder for object and array addresses', () => {
    for (const url of [{ href: 'https://www.facebook.com/acme' }, ['https://www.facebook.com/acme']]) {
      const html = exportFeed({ url })
      expect(parse(html).querySelectorAll('iframe')).toHaveLength(0)
      expect(html).toContain('bg-gradient-to-br')
    }
  })
})
