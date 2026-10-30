/**
 * Shared URL library for the Facebook page embed block.
 *
 * Module: `src/lib/facebook-page-embed.ts`.
 */
import { describe, it, expect } from 'vitest'
import {
  facebookPageEmbedUrl,
  clampFacebookPageHeight,
  FACEBOOK_PAGE_DEFAULT_HEIGHT,
  RESERVED_SEGMENTS as LIBRARY_RESERVED_SEGMENTS,
} from '../src/lib/facebook-page-embed'
import { FACEBOOK_PAGE_URL_CORPUS } from './helpers/facebook-page-injection-corpus'

const PLUGIN_PREFIX = 'https://www.facebook.com/plugins/page.php?'

const QUERY_KEY_ORDER = [
  'href',
  'tabs',
  'width',
  'height',
  'small_header',
  'adapt_container_width',
  'hide_cover',
  'show_facepile',
]

/** The fixed values carried next to the `href` in every plugin address. */
const FIXED_PARAM_VALUES: Record<string, string> = {
  tabs: 'timeline',
  // The plugin frame WIDTH — a different constant from the default height.
  width: '340',
  small_header: 'true',
  adapt_container_width: 'true',
  hide_cover: 'false',
  show_facepile: 'false',
}

/**
 * First path segment values that name a site section, not a Page.
 *
 * This copy is the test's own oracle. It is asserted to be exactly equal to
 * the library's exported list, so the two cannot drift apart.
 */
const RESERVED_SEGMENTS: readonly string[] = [
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
]

/** Raw origin anchor used by the test to find the first path segment. */
const TEST_ORIGIN_RE = /^https:\/\/(?:www\.|m\.)?facebook\.com(\/[^?#]*)?/i

function queryKeys(address: string): string[] {
  return address.split('?')[1].split('&').map((pair) => pair.split('=')[0])
}

function decodedHref(address: string): string {
  return new URLSearchParams(address.split('?')[1]).get('href') ?? ''
}

/** Decoded value of one query parameter of the plugin address. */
function paramValue(address: string, key: string): string | null {
  return new URLSearchParams(address.split('?')[1]).get(key)
}

/**
 * Assert the full contract of one accepted input: the plugin prefix, the
 * exact key list and order, the canonical `href` and the fixed values of the
 * seven remaining parameters.
 */
function expectFullPluginContract(
  address: string | null,
  expectedHref: string,
  expectedHeight: number,
): void {
  expect(typeof address).toBe('string')
  const value = address as string
  expect(value.startsWith(PLUGIN_PREFIX)).toBe(true)
  expect(queryKeys(value)).toEqual(QUERY_KEY_ORDER)
  expect(decodedHref(value)).toBe(expectedHref)
  expect(paramValue(value, 'tabs')).toBe(FIXED_PARAM_VALUES.tabs)
  expect(paramValue(value, 'width')).toBe(FIXED_PARAM_VALUES.width)
  expect(paramValue(value, 'height')).toBe(String(expectedHeight))
  expect(paramValue(value, 'small_header')).toBe(FIXED_PARAM_VALUES.small_header)
  expect(paramValue(value, 'adapt_container_width')).toBe(
    FIXED_PARAM_VALUES.adapt_container_width,
  )
  expect(paramValue(value, 'hide_cover')).toBe(FIXED_PARAM_VALUES.hide_cover)
  expect(paramValue(value, 'show_facepile')).toBe(FIXED_PARAM_VALUES.show_facepile)
}

/** First path segment of a raw Page address, lower-cased. */
function firstPathSegment(input: string): string {
  const match = TEST_ORIGIN_RE.exec(input)
  if (!match) return ''
  const path = match[1] ?? ''
  const segments = path.split('/').filter(Boolean)
  return segments.length === 0 ? '' : segments[0].toLowerCase()
}

describe('reserved segments — library and test agree', () => {
  it('matches the library list exactly, in order', () => {
    expect(RESERVED_SEGMENTS).toEqual(LIBRARY_RESERVED_SEGMENTS)
  })
})

describe('facebookPageEmbedUrl — accepted page hosts', () => {
  const HOSTS = [
    'https://www.facebook.com/acme',
    'https://facebook.com/acme',
    'https://m.facebook.com/acme',
  ]

  it.each(HOSTS)('builds a plugin address for %s', (input) => {
    const address = facebookPageEmbedUrl(input)

    expect(typeof address).toBe('string')
    expect(address!.startsWith(PLUGIN_PREFIX)).toBe(true)
    expect(queryKeys(address!)).toEqual(QUERY_KEY_ORDER)
    expect(decodedHref(address!)).toBe('https://www.facebook.com/acme')
  })

  it('keeps the query id of a profile.php page', () => {
    const address = facebookPageEmbedUrl('https://www.facebook.com/profile.php?id=123')

    expect(typeof address).toBe('string')
    expect(queryKeys(address!)).toEqual(QUERY_KEY_ORDER)
    expect(decodedHref(address!)).toBe('https://www.facebook.com/profile.php?id=123')
  })
})

describe('facebookPageEmbedUrl — refused inputs', () => {
  const REFUSED: unknown[] = [
    'https://www.facebook.com/plugins',
    'http://www.facebook.com/acme',
    'https://u:p@www.facebook.com/acme',
    'https://www.facebook.com:443/acme',
    '',
    12345,
  ]

  it.each(REFUSED.map((value) => [value]))('returns null for %j', (value) => {
    expect(facebookPageEmbedUrl(value)).toBeNull()
  })
})

describe('clampFacebookPageHeight', () => {
  const CASES: Array<[unknown, number]> = [
    [0, 70],
    [69, 70],
    [70, 70],
    [800, 800],
    [801, 800],
    ['600', 600],
    ['abc', FACEBOOK_PAGE_DEFAULT_HEIGHT],
    [400.5, FACEBOOK_PAGE_DEFAULT_HEIGHT],
  ]

  it.each(CASES)('clamps %j to %i', (input, expected) => {
    expect(clampFacebookPageHeight(input)).toBe(expected)
  })
})

describe('facebookPageEmbedUrl — default height', () => {
  it('uses the default height when no height is given', () => {
    const address = facebookPageEmbedUrl('https://www.facebook.com/acme')

    expect(address).toContain('height=' + FACEBOOK_PAGE_DEFAULT_HEIGHT)
  })
})

describe('facebookPageEmbedUrl — valid table', () => {
  const VALID: Array<[string, string]> = [
    ['https://www.facebook.com/acme', 'https://www.facebook.com/acme'],
    ['https://facebook.com/acme', 'https://www.facebook.com/acme'],
    ['https://m.facebook.com/acme', 'https://www.facebook.com/acme'],
    ['https://www.facebook.com/acme/', 'https://www.facebook.com/acme'],
    ['https://facebook.com/acme/', 'https://www.facebook.com/acme'],
    ['https://m.facebook.com/acme/', 'https://www.facebook.com/acme'],
    ['https://www.facebook.com/acme?x=1', 'https://www.facebook.com/acme'],
    ['https://www.facebook.com/acme#frag', 'https://www.facebook.com/acme'],
    [
      'https://www.facebook.com/profile.php?id=123',
      'https://www.facebook.com/profile.php?id=123',
    ],
    [
      'https://www.facebook.com/Profile.php?id=123',
      'https://www.facebook.com/profile.php?id=123',
    ],
    [
      'https://www.facebook.com/people/Name/123/',
      'https://www.facebook.com/people/Name/123',
    ],
    [
      'https://www.facebook.com/caf%C3%A9',
      'https://www.facebook.com/caf%C3%A9',
    ],
  ]

  it.each(VALID)('builds the full plugin address for %s', (input, expectedHref) => {
    expectFullPluginContract(
      facebookPageEmbedUrl(input),
      expectedHref,
      FACEBOOK_PAGE_DEFAULT_HEIGHT,
    )
  })
})

describe('facebookPageEmbedUrl — invalid table', () => {
  const INVALID: Array<[string, unknown]> = [
    ['reserved segment plugins', 'https://www.facebook.com/plugins'],
    ['reserved segment sharer', 'https://www.facebook.com/sharer'],
    ['reserved segment dialog', 'https://www.facebook.com/dialog'],
    ['reserved segment login', 'https://www.facebook.com/login'],
    ['reserved segment tr', 'https://www.facebook.com/tr'],
    ['reserved segment l.php', 'https://www.facebook.com/l.php'],
    ['reserved segment share', 'https://www.facebook.com/share'],
    ['reserved segment watch', 'https://www.facebook.com/watch'],
    ['reserved segment groups', 'https://www.facebook.com/groups'],
    ['reserved segment events', 'https://www.facebook.com/events'],
    ['reserved segment marketplace', 'https://www.facebook.com/marketplace'],
    ['reserved segment help', 'https://www.facebook.com/help'],
    ['reserved segment policies', 'https://www.facebook.com/policies'],
    ['reserved segment privacy', 'https://www.facebook.com/privacy'],
    ['other host', 'https://example.com/acme'],
    ['other host', 'https://facebook.net/acme'],
    ['plain http scheme', 'http://www.facebook.com/acme'],
    ['credentials in the authority', 'https://u:p@www.facebook.com/acme'],
    ['explicit port', 'https://www.facebook.com:443/acme'],
    ['empty string', ''],
    ['null value', null],
    ['undefined value', undefined],
    ['number value', 12345],
    ['object value', { url: 'https://www.facebook.com/acme' }],
    ['array value', ['https://www.facebook.com/acme']],
  ]

  it.each(INVALID)('returns null for %s', (_label, value) => {
    expect(facebookPageEmbedUrl(value)).toBeNull()
  })
})

describe('facebookPageEmbedUrl — corpus', () => {
  it.each(FACEBOOK_PAGE_URL_CORPUS.map((row) => [row.input, row.expected] as const))(
    'matches the corpus row for %s',
    (input, expected) => {
      const address = facebookPageEmbedUrl(input)

      if (expected === null) {
        expect(address).toBeNull()
        return
      }

      expectFullPluginContract(address, expected, FACEBOOK_PAGE_DEFAULT_HEIGHT)
    },
  )
})

describe('clampFacebookPageHeight — height table', () => {
  const HEIGHTS: Array<[unknown, number]> = [
    [0, 70],
    [69, 70],
    [70, 70],
    [800, 800],
    [801, 800],
    ['abc', FACEBOOK_PAGE_DEFAULT_HEIGHT],
    [400.5, FACEBOOK_PAGE_DEFAULT_HEIGHT],
    ['600', 600],
    ['1e3', FACEBOOK_PAGE_DEFAULT_HEIGHT],
    ['0x20', FACEBOOK_PAGE_DEFAULT_HEIGHT],
    [' 600 ', FACEBOOK_PAGE_DEFAULT_HEIGHT],
    [Number.NaN, FACEBOOK_PAGE_DEFAULT_HEIGHT],
    [Number.POSITIVE_INFINITY, FACEBOOK_PAGE_DEFAULT_HEIGHT],
    [null, FACEBOOK_PAGE_DEFAULT_HEIGHT],
    [{}, FACEBOOK_PAGE_DEFAULT_HEIGHT],
  ]

  it.each(HEIGHTS)('clamps %j to %i', (input, expected) => {
    expect(clampFacebookPageHeight(input)).toBe(expected)
  })

  it.each(HEIGHTS)('carries the clamped height %j in the address', (input, expected) => {
    const address = facebookPageEmbedUrl('https://www.facebook.com/acme', input)

    expect(typeof address).toBe('string')
    expect(paramValue(address as string, 'height')).toBe(String(expected))
  })
})

describe('facebookPageEmbedUrl — corpus coverage of the reserved first segments', () => {
  it('refuses at least one corpus row per reserved first segment', () => {
    const covered = new Set<string>()

    for (const row of FACEBOOK_PAGE_URL_CORPUS) {
      if (row.expected !== null) continue
      const segment = firstPathSegment(row.input)
      if (segment !== '') covered.add(segment)
    }

    // Checked against the library's list — the single source of truth — so a
    // new reserved segment without a matching corpus row fails here.
    const missing = LIBRARY_RESERVED_SEGMENTS.filter(
      (segment) => !covered.has(segment.toLowerCase()),
    )

    expect(missing).toEqual([])
  })
})
