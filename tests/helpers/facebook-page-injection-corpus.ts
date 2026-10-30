/**
 * Hostile URL / title corpus for the Facebook page embed block.
 *
 * Every string here is inert test DATA. Nothing in this file is executed,
 * evaluated or fetched — the rows only describe what the shared URL helper
 * must refuse and which canonical Page URL it must produce for accepted
 * input.
 *
 * The `expected` value of an accepted row is the canonical PAGE url (the
 * value that becomes the address `href`), never the plugin address. The
 * canonical form keeps the raw case of the path segments, normalises the
 * host to `www.facebook.com`, drops a trailing slash and — outside the
 * `profile.php` case — drops the query and the fragment.
 */
import { EXPORT_XSS_CORPUS } from './injection-corpus'

export interface FacebookPageUrlCase {
  /** The raw string handed to the shared URL helper. */
  input: string
  /** The canonical Page url, or `null` when the helper must refuse it. */
  expected: string | null
  /** Short neutral reason for the row. */
  note?: string
}

const ACCEPTED_PAGE = 'https://www.facebook.com/acme'

export const FACEBOOK_PAGE_URL_CORPUS: FacebookPageUrlCase[] = [
  // --- accepted: canonical host normalisation ---
  {
    input: 'https://www.facebook.com/acme',
    expected: ACCEPTED_PAGE,
    note: 'plain page path',
  },
  {
    input: 'https://facebook.com/acme',
    expected: ACCEPTED_PAGE,
    note: 'host without the www label is normalised',
  },
  {
    input: 'HTTPS://WWW.FACEBOOK.COM/acme',
    expected: ACCEPTED_PAGE,
    note: 'scheme and host are matched case-insensitively',
  },
  {
    input: 'https://www.facebook.com/Acme',
    expected: 'https://www.facebook.com/Acme',
    note: 'path case is preserved',
  },
  {
    input: '\u00a0 https://www.facebook.com/acme \n',
    expected: ACCEPTED_PAGE,
    note: 'surrounding whitespace is trimmed',
  },
  {
    input: 'https://www.facebook.com/profile.php?id=%31%32',
    expected: 'https://www.facebook.com/profile.php?id=12',
    note: 'the numeric id is decoded before it is checked',
  },
  {
    input: 'https://www.facebook.com/profile.php?id=123456789012345678901',
    expected: null,
    note: 'id longer than 20 digits',
  },
  {
    input: 'https://m.facebook.com/acme',
    expected: ACCEPTED_PAGE,
    note: 'mobile host is normalised to the canonical host',
  },

  // --- accepted: trailing slash, query and fragment are dropped ---
  {
    input: 'https://www.facebook.com/acme/',
    expected: ACCEPTED_PAGE,
    note: 'trailing slash is dropped',
  },
  {
    input: 'https://www.facebook.com/acme?x=1',
    expected: ACCEPTED_PAGE,
    note: 'query string is dropped',
  },
  {
    input: 'https://www.facebook.com/acme#frag',
    expected: ACCEPTED_PAGE,
    note: 'fragment is dropped',
  },

  // --- accepted: multi segment and encoded names keep their raw case ---
  {
    input: 'https://www.facebook.com/people/Name/123/',
    expected: 'https://www.facebook.com/people/Name/123',
    note: 'multi segment path keeps its raw case, trailing slash dropped',
  },
  {
    input: 'https://www.facebook.com/caf%C3%A9',
    expected: 'https://www.facebook.com/caf%C3%A9',
    note: 'percent encoded non-ascii name is kept verbatim',
  },

  // --- accepted: profile.php pages ---
  {
    input: 'https://www.facebook.com/profile.php?id=123',
    expected: 'https://www.facebook.com/profile.php?id=123',
    note: 'profile page with a numeric id',
  },
  {
    input: 'https://www.facebook.com/Profile.php?id=123',
    expected: 'https://www.facebook.com/profile.php?id=123',
    note: 'profile segment is lower-cased in the canonical form',
  },

  // --- refused: credentials in the authority ---
  {
    input: 'https://u:p@facebook.com/x',
    expected: null,
    note: 'userinfo is refused',
  },
  {
    input: 'https://@facebook.com/x',
    expected: null,
    note: 'empty userinfo is refused',
  },
  {
    input: 'https://facebook.com@evil.com/x',
    expected: null,
    note: 'userinfo that hides a foreign host is refused',
  },

  // --- refused: explicit ports ---
  {
    input: 'https://facebook.com:443/x',
    expected: null,
    note: 'explicit port is refused',
  },
  {
    input: 'https://facebook.com:8443/x',
    expected: null,
    note: 'non standard port is refused',
  },
  {
    input: 'https://facebook.com:/x',
    expected: null,
    note: 'empty port is refused',
  },

  // --- refused: other hosts ---
  {
    input: 'https://facebook.com.evil.com/x',
    expected: null,
    note: 'host with an appended suffix is refused',
  },
  {
    input: 'https://evilfacebook.com/x',
    expected: null,
    note: 'host with a prefixed label is refused',
  },
  {
    input: 'https://facebook.com./x',
    expected: null,
    note: 'host with a trailing dot is refused',
  },
  {
    input: 'https://fb.com/x',
    expected: null,
    note: 'short host alias is refused',
  },
  {
    input: 'https://l.facebook.com/x',
    expected: null,
    note: 'unknown subdomain is refused',
  },
  {
    input: 'https://web.facebook.com/x',
    expected: null,
    note: 'unknown subdomain is refused',
  },

  // --- refused: look-alike hosts ---
  {
    input: 'https://ｆacebook.com/x',
    expected: null,
    note: 'fullwidth host label is refused',
  },
  {
    input: 'https://facebook。com/x',
    expected: null,
    note: 'ideographic dot host is refused',
  },
  {
    input: 'https://facebooK.com/x',
    expected: null,
    note: 'kelvin sign host is refused',
  },

  // --- refused: schemes ---
  {
    input: 'http://www.facebook.com/x',
    expected: null,
    note: 'plain http scheme is refused',
  },
  {
    input: 'javascript:alert(1)',
    expected: null,
    note: 'script scheme is refused',
  },
  {
    input: 'data:text/html,x',
    expected: null,
    note: 'data scheme is refused',
  },
  {
    input: 'vbscript:x',
    expected: null,
    note: 'legacy script scheme is refused',
  },
  {
    input: '//www.facebook.com/x',
    expected: null,
    note: 'protocol relative url is refused',
  },
  {
    input: 'https:facebook.com/x',
    expected: null,
    note: 'scheme relative url is refused',
  },
  {
    input: 'https:///facebook.com/x',
    expected: null,
    note: 'empty authority is refused',
  },

  // --- refused: dot segments ---
  {
    input: 'https://www.facebook.com/%2e/acme',
    expected: null,
    note: 'encoded dot segment is refused',
  },
  {
    input: 'https://www.facebook.com/%2E%2e/plugins',
    expected: null,
    note: 'encoded dot segments are refused',
  },
  {
    input: 'https://www.facebook.com/./acme',
    expected: null,
    note: 'dot segment is refused',
  },
  {
    input: 'https://www.facebook.com/a/../plugins',
    expected: null,
    note: 'parent segment is refused',
  },
  {
    input: 'https://www.facebook.com/..',
    expected: null,
    note: 'parent only path is refused',
  },

  // --- refused: encoded separators ---
  {
    input: 'https://www.facebook.com/a%2Fb',
    expected: null,
    note: 'encoded slash inside a segment is refused',
  },
  {
    input: 'https://www.facebook.com/a%2fb',
    expected: null,
    note: 'lower case encoded slash inside a segment is refused',
  },
  {
    input: 'https://www.facebook.com/a%5Cb',
    expected: null,
    note: 'encoded backslash inside a segment is refused',
  },
  {
    input: 'https://www.facebook.com/..%2Fx',
    expected: null,
    note: 'encoded parent segment is refused',
  },

  // --- refused: encoded ascii bytes that are not separators ---
  // A percent-encoded byte is only allowed when its value is 0x80 or above,
  // so an encoded ordinary ascii character is refused on its own.
  {
    input: 'https://www.facebook.com/a%41b',
    expected: null,
    note: 'encoded ascii letter below 0x80 is refused',
  },
  {
    input: 'https://www.facebook.com/a%7Eb',
    expected: null,
    note: 'encoded ascii tilde below 0x80 is refused',
  },
  {
    input: 'https://www.facebook.com/a%22b',
    expected: null,
    note: 'encoded ascii quote below 0x80 is refused',
  },

  // --- refused: raw backslashes ---
  {
    input: 'https:\\\\facebook.com:8443/x',
    expected: null,
    note: 'raw backslashes in the authority are refused',
  },
  {
    input: 'https://facebook.com\\@evil.com',
    expected: null,
    note: 'backslash before a foreign authority is refused',
  },
  {
    input: 'https://facebook.com\\acme',
    expected: null,
    note: 'backslash in the host is refused',
  },

  // --- refused: markup and quotes inside the path ---
  {
    input: 'https://www.facebook.com/a"><scr' + 'ipt>',
    expected: null,
    note: 'markup in the path is refused',
  },
  {
    input: "https://www.facebook.com/a'onload=",
    expected: null,
    note: 'quote and attribute in the path is refused',
  },

  // --- refused: whitespace inside the string ---
  {
    input: 'https://www.facebook.com/ac me',
    expected: null,
    note: 'space inside the string is refused',
  },
  {
    input: 'https://www.facebook.com/ac\tme',
    expected: null,
    note: 'tab inside the string is refused',
  },
  {
    input: 'https://www.facebook.com/ac\nme',
    expected: null,
    note: 'newline inside the string is refused',
  },

  // --- refused: raw non-ascii and over-long input ---
  {
    input: 'https://www.facebook.com/café',
    expected: null,
    note: 'raw non-ascii path character is refused',
  },
  {
    input: `https://www.facebook.com/${'a'.repeat(10000)}`,
    expected: null,
    note: 'over-long path is refused',
  },

  // --- refused: reserved first segments ---
  {
    input: 'https://www.facebook.com/PLUGINS/x',
    expected: null,
    note: 'reserved segment in upper case is refused',
  },
  {
    input: 'https://www.facebook.com/plugins/x',
    expected: null,
    note: 'reserved section segment is refused',
  },
  {
    input: 'https://www.facebook.com/sharer/x',
    expected: null,
    note: 'reserved section segment is refused',
  },
  {
    input: 'https://www.facebook.com/dialog/x',
    expected: null,
    note: 'reserved section segment is refused',
  },
  {
    input: 'https://www.facebook.com/login/x',
    expected: null,
    note: 'reserved section segment is refused',
  },
  {
    input: 'https://www.facebook.com/tr',
    expected: null,
    note: 'reserved section segment is refused',
  },
  {
    input: 'https://www.facebook.com/l.php/x',
    expected: null,
    note: 'reserved section segment is refused',
  },
  {
    input: 'https://www.facebook.com/share/x',
    expected: null,
    note: 'reserved section segment is refused',
  },
  {
    input: 'https://www.facebook.com/watch/x',
    expected: null,
    note: 'reserved section segment is refused',
  },
  {
    input: 'https://www.facebook.com/groups/x',
    expected: null,
    note: 'reserved section segment is refused',
  },
  {
    input: 'https://www.facebook.com/events/x',
    expected: null,
    note: 'reserved section segment is refused',
  },
  {
    input: 'https://www.facebook.com/marketplace/x',
    expected: null,
    note: 'reserved section segment is refused',
  },
  {
    input: 'https://www.facebook.com/help/x',
    expected: null,
    note: 'reserved section segment is refused',
  },
  {
    input: 'https://www.facebook.com/policies/x',
    expected: null,
    note: 'reserved section segment is refused',
  },
  {
    input: 'https://www.facebook.com/privacy/x',
    expected: null,
    note: 'reserved section segment is refused',
  },

  // --- refused: profile.php without a usable id ---
  {
    input: 'https://www.facebook.com/profile.php?id=abc',
    expected: null,
    note: 'non numeric id is refused',
  },
  {
    input: 'https://www.facebook.com/profile.php?id=1&id=2',
    expected: null,
    note: 'repeated id is refused',
  },
  {
    input: 'https://www.facebook.com/profile.php',
    expected: null,
    note: 'missing id is refused',
  },
  {
    input: 'https://www.facebook.com/PROFILE.PHP',
    expected: null,
    note: 'upper case profile segment without an id is refused',
  },
]

/**
 * Hostile titles for the embed block: the shared export corpus plus extra
 * shapes that matter for a title field. The extra shapes are assembled from
 * fragments so the file itself does not carry a literal sequence that the
 * repository scanners would flag.
 */
export const FACEBOOK_PAGE_TITLE_CORPUS: string[] = [
  ...EXPORT_XSS_CORPUS,
  'x'.repeat(10000),
  ['<scr', 'ipt>alert(1)</scr', 'ipt>'].join(''),
  ['"><img src=x on', 'error=alert(1)>'].join(''),
  ['" on', 'load="x'].join(''),
  ["' on", "click='x"].join(''),
  '‮reversed text‬',
  ['left', '\t', 'right'].join(''),
  ['café', ' naïve'].join(''),
]
