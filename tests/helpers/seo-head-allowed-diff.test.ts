import { describe, expect, it } from 'vitest'
import { stripSeoHeadAdditions } from './seo-head-allowed-diff'

const FONT = 'https://fonts.googleapis.com/css2?family=DM+Sans&family=Space+Grotesk&display=swap'
const PAIR =
  `  <link rel="preload" as="style" href="${FONT}" onload="this.onload=null;this.rel='stylesheet'" />\n` +
  `  <noscript><link rel="stylesheet" href="${FONT}" /></noscript>`
const OLD_LINK = `  <link rel="stylesheet" href="${FONT}" />`
const TWITTER =
  '  <meta name="twitter:card" content="summary" />\n' +
  '  <meta name="twitter:title" content="T" />\n'
const JSON_LD = '  <script type="application/ld+json">{"@context":"x"}</script>\n'

const doc = (head: string, body = '') => `<head>\n${head}\n</head>\n<body>\n${body}</body>\n`

describe('stripSeoHeadAdditions', () => {
  it('removes the twitter metas and counts them', () => {
    const r = stripSeoHeadAdditions(doc(`${TWITTER}  <title>T</title>`))
    expect(r.html).toBe(doc('  <title>T</title>'))
    expect(r.counts.twitter).toBe(2)
  })

  it('removes the json-ld script and counts it', () => {
    const r = stripSeoHeadAdditions(doc(`${JSON_LD}  <title>T</title>`))
    expect(r.html).toBe(doc('  <title>T</title>'))
    expect(r.counts.jsonLd).toBe(1)
  })

  it('strips image loading hints only inside img tags', () => {
    const r = stripSeoHeadAdditions(
      doc('', '<img src="a" decoding="async" loading="lazy" alt="x">\n<img src="b" decoding="async" fetchpriority="high">\n<p loading="lazy">t</p>\n'),
    )
    expect(r.html).toBe(doc('', '<img src="a" alt="x">\n<img src="b">\n<p loading="lazy">t</p>\n'))
    expect(r.counts.imgAttrs).toBe(4)
  })

  it('rewrites the font pair back to the single stylesheet link', () => {
    const r = stripSeoHeadAdditions(doc(PAIR))
    expect(r.html).toBe(doc(OLD_LINK))
    expect(r.counts.fontLinks).toBe(1)
  })

  it('leaves an already-old font link alone', () => {
    const r = stripSeoHeadAdditions(doc(OLD_LINK))
    expect(r.html).toBe(doc(OLD_LINK))
    expect(r.counts.fontLinks).toBe(0)
  })

  it('removes a precompiled style element and tolerates its absence', () => {
    const r = stripSeoHeadAdditions(doc('  <style data-export-css>a{b:c}</style>\n  <title>T</title>'))
    expect(r.html).toBe(doc('  <title>T</title>'))
    expect(r.counts.cssStyle).toBe(1)
    expect(stripSeoHeadAdditions(doc('  <title>T</title>')).counts.cssStyle).toBe(0)
  })

  it('is a no-op with zero counts on an unaffected document', () => {
    const d = doc('  <title>T</title>', '<img src="a">\n')
    const r = stripSeoHeadAdditions(d)
    expect(r.html).toBe(d)
    expect(r.counts).toEqual({ twitter: 0, jsonLd: 0, imgAttrs: 0, fontLinks: 0, cssStyle: 0 })
  })

  it('still differs after stripping when an out-of-set change is present', () => {
    const base = stripSeoHeadAdditions(doc(`${TWITTER}${JSON_LD}${PAIR}\n  <title>T</title>`)).html
    const extraMeta = stripSeoHeadAdditions(doc(`${TWITTER}  <meta name="x" content="y" />\n${PAIR}\n  <title>T</title>`)).html
    const newTitle = stripSeoHeadAdditions(doc(`${TWITTER}${PAIR}\n  <title>U</title>`)).html
    const otherGa = stripSeoHeadAdditions(doc(`${TWITTER}${PAIR}\n  <title>T</title>\n  <script>gaId="G-2"</script>`)).html
    expect(extraMeta).not.toBe(base)
    expect(newTitle).not.toBe(base)
    expect(otherGa).not.toBe(base)
  })

  it('does not rewrite a font pair whose urls differ', () => {
    const odd = PAIR.replace('<noscript><link rel="stylesheet" href="' + FONT, '<noscript><link rel="stylesheet" href="https://other.example/f.css')
    const r = stripSeoHeadAdditions(doc(odd))
    expect(r.counts.fontLinks).toBe(0)
    expect(r.html).toContain('rel="preload"')
  })

  it('reports a canonical link as out of set and keeps it', () => {
    const r = stripSeoHeadAdditions(doc('  <link rel="canonical" href="https://a.example/" />'))
    expect(r.outOfSet).toEqual(['canonical'])
    expect(r.html).toContain('rel="canonical"')
    expect(stripSeoHeadAdditions(doc('  <title>T</title>')).outOfSet).toEqual([])
  })
})
