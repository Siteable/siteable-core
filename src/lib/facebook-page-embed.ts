/**
 * Shared URL library for the Facebook page embed block.
 *
 * The decision is made WITHOUT the WHATWG URL parser: no dot-segment
 * resolution, no backslash treated as a separator, no internationalised-host
 * folding, no default-port elision. The answer therefore always describes the
 * text that is stored, not some other string derived from it. The module has
 * zero imports and never constructs a WHATWG URL.
 *
 * The input is trimmed first, and every rule below applies to the trimmed
 * text. The canonical Page address that comes back is a NORMALISED form:
 * host `www.facebook.com`, path segments kept in their original case (only the
 * `profile.php` form is lower-cased), no trailing slash, and
 * the query and fragment dropped — except the numeric page id of the
 * `profile.php` form, which is kept. That id is the one value that is
 * decoded, and it is decoded before it is checked.
 *
 * Example Page address: `https://www.facebook.com/acme`.
 *
 * This module is introduced ahead of the block that consumes it: the shared
 * decision is written and pinned here first, and the exporter and the editor
 * take it from this one place.
 */

/** Height used when the requested height is missing or not a plain integer. */
export const FACEBOOK_PAGE_DEFAULT_HEIGHT = 500

/** Longest accepted input, measured on the raw text before trimming. */
const MAX_INPUT_LENGTH = 2048

/** Smallest frame height the page plugin supports. */
const MIN_FRAME_HEIGHT = 70

/** Largest frame height the page plugin supports. */
const MAX_FRAME_HEIGHT = 800

/** Fixed frame width the page plugin is asked for. */
const PLUGIN_FRAME_WIDTH = '340'

/** Raw host anchor. No `u` flag: with `u` the Kelvin sign folds to `k`. */
const RAW_ORIGIN_RE = /^https:\/\/(?:www\.|m\.)?facebook\.com(?=\/|$)/i
/** Anything outside printable ASCII (the backslash is refused separately). */
const NON_PORTABLE_CHAR_RE = /[^\x21-\x7e]/
/** One path segment: ASCII slug characters, or percent-encoded bytes >= 0x80. */
const SEGMENT_RE = /^(?:[A-Za-z0-9._-]|%[89A-Fa-f][0-9A-Fa-f])+$/
/** A segment made only of dots is a relative path, never a Page name. */
const ALL_DOTS_RE = /^\.+$/
/** A plain decimal id, as used by the `profile.php` form. */
const PAGE_ID_RE = /^\d{1,20}$/

/** First path segment values that name a site section, not a Page. */
export const RESERVED_SEGMENTS: readonly string[] = [
  'plugins',
  'sharer',
  'dialog',
  'login',
  'tr',
  'l.php',
  'share',
  'watch',
  'groups',
  'events',
  'marketplace',
  'help',
  'policies',
  'privacy',
  'sharer.php',
  'login.php',
  'photo',
  'photo.php',
  'photos',
  'reel',
  'reels',
  'stories',
  'story.php',
  'permalink.php',
  'hashtag',
  'search',
  'settings',
  'messages',
  'notifications',
  'ads',
]

/**
 * Decide whether a stored Page address can be embedded, and build the plugin
 * address from it. Returns `null` when the address is not a Page address.
 *
 * The check runs on the trimmed text, without any URL parser, so that the
 * answer always describes the string that is stored and the string that is
 * rendered.
 */
export function facebookPageEmbedUrl(url: unknown, height?: unknown): string | null {
  // The length cap is applied to the RAW input, so a very long padded string
  // is refused even when its trimmed form would fit. Every other rule below
  // applies to the trimmed text.
  if (typeof url !== 'string' || url.length > MAX_INPUT_LENGTH) return null

  const s = url.trim()
  if (NON_PORTABLE_CHAR_RE.test(s) || s.indexOf('\\') !== -1) return null

  const origin = RAW_ORIGIN_RE.exec(s)
  if (!origin) return null

  const rest = s.slice(origin[0].length)
  const queryAt = rest.indexOf('?')
  const hashAt = rest.indexOf('#')

  let pathEnd = rest.length
  if (queryAt !== -1) pathEnd = queryAt
  if (hashAt !== -1 && hashAt < pathEnd) pathEnd = hashAt
  const pathRaw = rest.slice(0, pathEnd)

  let queryRaw = ''
  if (queryAt !== -1 && (hashAt === -1 || hashAt > queryAt)) {
    const afterQuery = rest.slice(queryAt + 1)
    const hashAfterQuery = afterQuery.indexOf('#')
    queryRaw = hashAfterQuery === -1 ? afterQuery : afterQuery.slice(0, hashAfterQuery)
  }

  const segs = pathRaw.split('/').filter(Boolean)
  if (segs.length < 1) return null

  for (const seg of segs) {
    if (!SEGMENT_RE.test(seg) || ALL_DOTS_RE.test(seg)) return null
  }

  const first = segs[0].toLowerCase()
  if (RESERVED_SEGMENTS.indexOf(first) !== -1) return null

  let canonical: string
  if (first === 'profile.php') {
    if (segs.length !== 1) return null
    // The `id` query key is matched case-sensitively, so `?ID=123` on its own
    // is refused — deliberately, because the page plugin's own key is
    // lower-case. The value IS decoded, and the decoded value is what is
    // checked.
    const ids = new URLSearchParams(queryRaw).getAll('id')
    if (ids.length !== 1 || !PAGE_ID_RE.test(ids[0])) return null
    canonical = 'https://www.facebook.com/profile.php?id=' + ids[0]
  } else {
    canonical = 'https://www.facebook.com/' + segs.join('/')
  }

  const params = new URLSearchParams()
  params.append('href', canonical)
  params.append('tabs', 'timeline')
  params.append('width', PLUGIN_FRAME_WIDTH)
  params.append('height', String(clampFacebookPageHeight(height)))
  params.append('small_header', 'true')
  params.append('adapt_container_width', 'true')
  params.append('hide_cover', 'false')
  params.append('show_facepile', 'false')

  return 'https://www.facebook.com/plugins/page.php?' + params.toString()
}

/**
 * Resolve the height of an embedded Page to a usable number. Only a plain
 * integer or a plain digit string is accepted; anything else falls back to the
 * default. The result is clamped to the range the plugin supports.
 */
export function clampFacebookPageHeight(height: unknown): number {
  let n: number
  if (typeof height === 'number' && Number.isInteger(height)) {
    n = height
  } else if (typeof height === 'string' && /^\d+$/.test(height)) {
    n = Number(height)
  } else {
    n = FACEBOOK_PAGE_DEFAULT_HEIGHT
  }
  return Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, n))
}
