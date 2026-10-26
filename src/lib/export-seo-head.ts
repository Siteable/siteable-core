/**
 * Head fragments for the exported document: canonical link, Twitter card
 * meta, JSON-LD structured data and the non-blocking font links.
 *
 * Every function here is pure and synchronous: no network, no file access.
 * Callers pass values that were already policy-checked (image URLs) so the
 * social tags can never diverge from the Open Graph tags.
 */
import { escapeHtml } from './html-escape'
import { scriptLiteral } from './script-literal'

/**
 * Raw shape of an accepted site URL: `http://` or `https://` (any case), an
 * authority free of `@`, `\`, quotes, angle brackets, whitespace, `/`, `?` and
 * `#`, and at most one trailing `/`.
 */
const STRICT_ORIGIN_RE = /^https?:\/\/[^\s@\\"'<>?#/]+\/?$/i

/**
 * Reduce a consumer-supplied site URL to a bare origin, or '' when it is not a
 * plain http(s) origin.
 *
 * Accepted: `http(s)://host[:port]` with an optional single trailing `/`, e.g.
 * `https://a.example`, `HTTPS://A.Example`, `http://localhost:3000`,
 * `https://[::1]`. The result is the normalized origin.
 *
 * Rejected (returns ''): any other scheme, userinfo (`@`), backslashes, quotes,
 * angle brackets, inner whitespace, a path (including `/.`, `/..` and `/%2e`),
 * a query, a fragment, and forms such as `https:a.example`. The raw string is
 * checked BEFORE URL parsing, so the parser cannot turn a malformed shape into
 * a plausible one. Leading and trailing whitespace is trimmed first.
 *
 * The host of an accepted value is normalized by the URL parser: it is
 * lowercased, percent-decoded, converted to punycode (IDN) and rewritten to a
 * canonical IPv4 form, and a default port is dropped.
 */
export function normalizeSiteUrl(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const value = raw.trim()
  if (!STRICT_ORIGIN_RE.test(value)) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.origin
  } catch {
    return ''
  }
}

/** `<link rel="canonical">` for this page, or '' without a valid origin. */
export function renderCanonical(origin: string, pagePath: string): string {
  if (!origin) return ''
  return `  <link rel="canonical" href="${escapeHtml(origin + pagePath)}" />\n`
}

interface TwitterMetaInput {
  title: string
  description: string
  image: string
}

/** Twitter card tags; description and image only when present. */
export function renderTwitterMeta({ title, description, image }: TwitterMetaInput): string {
  const card = image ? 'summary_large_image' : 'summary'
  let out = `  <meta name="twitter:card" content="${card}" />\n`
  out += `  <meta name="twitter:title" content="${escapeHtml(title)}" />\n`
  if (description) {
    out += `  <meta name="twitter:description" content="${escapeHtml(description)}" />\n`
  }
  if (image) {
    out += `  <meta name="twitter:image" content="${escapeHtml(image)}" />\n`
  }
  return out
}

export interface JsonLdFaq {
  question: unknown
  answer: unknown
}

interface JsonLdInput {
  name: string
  origin: string
  /** Already gated by the URL policy; '' when absent or rejected. */
  logo: string
  faqs: readonly JsonLdFaq[]
}

function usableFaqs(faqs: readonly JsonLdFaq[]): Array<{ q: string; a: string }> {
  const out: Array<{ q: string; a: string }> = []
  for (const item of faqs) {
    if (!item || typeof item.question !== 'string' || typeof item.answer !== 'string') continue
    const q = item.question.trim()
    const a = item.answer.trim()
    if (q && a) out.push({ q, a })
  }
  return out
}

/**
 * One JSON-LD script: Organization, WebSite and (when there are usable items)
 * FAQPage. The WHOLE object goes through `scriptLiteral`, so no string in it
 * can close the script element or open a comment.
 */
export function renderJsonLd({ name, origin, logo, faqs }: JsonLdInput): string {
  const organization: Record<string, unknown> = { '@type': 'Organization', name }
  const website: Record<string, unknown> = { '@type': 'WebSite', name }
  if (origin) {
    organization.url = origin
    website.url = origin
  }
  if (logo) organization.logo = logo

  const graph: Array<Record<string, unknown>> = [organization, website]
  const items = usableFaqs(faqs)
  if (items.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: items.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    })
  }

  const data = { '@context': 'https://schema.org', '@graph': graph }
  return `  <script type="application/ld+json">${scriptLiteral(data)}</script>\n`
}

/**
 * Non-blocking stylesheet for the web fonts: preload, switched to a stylesheet
 * on load, with a noscript fallback. `fontUrl` is emitted byte-for-byte as the
 * previous render-blocking link did.
 */
export function renderFontLinks(fontUrl: string): string {
  return (
    `  <link rel="preload" as="style" href="${fontUrl}" onload="this.onload=null;this.rel='stylesheet'" />\n` +
    `  <noscript><link rel="stylesheet" href="${fontUrl}" /></noscript>`
  )
}
