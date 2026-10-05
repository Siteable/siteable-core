/**
 * ISS-004 — context-appropriate escaping for config-derived values in the
 * exporter's `<script>`, `<style>` and attribute contexts.
 *
 * The defect was one root cause with several sinks: settings/theme values were
 * interpolated without escaping appropriate to the context they landed in.
 * `JSON.stringify` was the one place escaping was attempted, and it is not
 * sufficient in an HTML script context (it leaves `/`, so `</script>` breaks
 * out). Theme values had no escaping at all — raw `'${theme.accent}'` inside the
 * inline Tailwind config, and raw `--color-bg-0: ${theme.bg0};` inside `<style>`.
 * Font fields fed `href="${fontUrl}"` with only space replacement.
 *
 * Assertion strategy: rather than substring-banning payloads (which false-
 * positives on values that are safely *present*, e.g. an apostrophe inside a
 * JSON string literal), each case asserts STRUCTURAL invariants — an injection
 * must not change how many `<script>`, `<style>`, `<img>` or `<a>` elements the
 * document contains. An escape that leaks produces a new element and fails.
 */
import { describe, it, expect } from 'vitest'
import { exportSiteToHTML } from '../src/lib/export-html'
import { resolveTheme, defaultTheme } from '../src/lib/theme-presets'
import { scriptLiteral } from '../src/lib/script-literal'
import type { SiteConfig } from '../src/blocks/types'

const PAYLOADS = [
  '</script><img src=x onerror=alert(1)>',
  '</style><img src=x onerror=alert(1)>',
  '"><img src=x onerror=alert(1)>',
  "';alert(1);'",
  '";}body{background:url(//evil.example)}',
  'x</script><script>alert(1)</script>',
]

const config = (theme: SiteConfig['theme'] = {}): SiteConfig => ({
  name: 'Escaping fixture',
  blocks: [],
  theme,
})

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length
const SCRIPT_OPEN = /<script\b/gi
const SCRIPT_CLOSE = /<\/script>/gi
const STYLE_OPEN = /<style\b/gi
const IMG = /<img\b/gi

describe('ISS-004 — inline <script> context', () => {
  it('gaId payloads cannot terminate the script element or add markup', () => {
    const clean = exportSiteToHTML(config(), { settings: { gaId: 'G-ABC123' } })
    for (const payload of PAYLOADS) {
      const out = exportSiteToHTML(config(), { settings: { gaId: payload } })
      expect(count(out, SCRIPT_OPEN)).toBe(count(clean, SCRIPT_OPEN))
      expect(count(out, SCRIPT_CLOSE)).toBe(count(clean, SCRIPT_CLOSE))
      expect(count(out, IMG)).toBe(count(clean, IMG))
    }
  })

  it('posthogKey payloads cannot terminate the script element or add markup', () => {
    const clean = exportSiteToHTML(config(), { settings: { posthogKey: 'phc_abc' } })
    for (const payload of PAYLOADS) {
      const out = exportSiteToHTML(config(), { settings: { posthogKey: payload } })
      expect(count(out, SCRIPT_OPEN)).toBe(count(clean, SCRIPT_OPEN))
      expect(count(out, SCRIPT_CLOSE)).toBe(count(clean, SCRIPT_CLOSE))
      expect(count(out, IMG)).toBe(count(clean, IMG))
    }
  })

  it('escapes the breakout sequence into an inert JS escape rather than dropping it', () => {
    const out = exportSiteToHTML(config(), {
      settings: { gaId: '</script><img src=x onerror=alert(1)>' },
    })
    // The value is neutralized by escaping, not silently discarded.
    expect(out).toContain('\\u003c/script\\u003e')
    expect(out).not.toContain('</script><img')
  })

  it('leaves an ordinary analytics id byte-identical to plain JSON.stringify', () => {
    const out = exportSiteToHTML(config(), { settings: { gaId: 'G-ABC123' } })
    expect(out).toContain(`gtag('config', ${JSON.stringify('G-ABC123')})`)
  })
})

describe('ISS-004 — <style> and Tailwind script theme context', () => {
  it('theme payloads cannot break out of the script or style blocks', () => {
    const clean = exportSiteToHTML(config())
    for (const payload of PAYLOADS) {
      const out = exportSiteToHTML(config({ accent: payload, bg0: payload, text0: payload }))
      expect(count(out, SCRIPT_OPEN)).toBe(count(clean, SCRIPT_OPEN))
      expect(count(out, STYLE_OPEN)).toBe(count(clean, STYLE_OPEN))
      expect(count(out, IMG)).toBe(count(clean, IMG))
      // A rejected theme value falls back to the default, so it never reaches
      // the document at all — nothing to escape.
      expect(out).not.toContain(payload)
    }
  })

  it('font fields cannot break out of the font <link> href attribute', () => {
    const clean = exportSiteToHTML(config())
    for (const payload of PAYLOADS) {
      const out = exportSiteToHTML(config({ fontSans: payload }))
      expect(count(out, IMG)).toBe(count(clean, IMG))
      expect(count(out, STYLE_OPEN)).toBe(count(clean, STYLE_OPEN))
      expect(out).not.toContain(payload)
    }
  })

  it('does not move the markup for a fully valid theme', () => {
    const out = exportSiteToHTML(config({ accent: '#ff0000', bg0: '#111111', fontSans: 'DM Sans' }))
    expect(out).toContain("'#ff0000'")
    expect(out).toContain('--color-bg-0: #111111;')
  })
})

describe('resolveTheme sanitization', () => {
  it('preserves valid values unchanged (byte-identity for existing sites)', () => {
    const theme = resolveTheme({ accent: '#22c55e', fontSans: 'DM Sans', radius: 8 })
    expect(theme.accent).toBe('#22c55e')
    expect(theme.fontSans).toBe('DM Sans')
    expect(theme.radius).toBe(8)
    expect(theme.bg0).toBe(defaultTheme.bg0)
  })

  it('falls back to the default for a value carrying context-breaking characters', () => {
    for (const payload of PAYLOADS) {
      expect(resolveTheme({ accent: payload }).accent).toBe(defaultTheme.accent)
      expect(resolveTheme({ fontSans: payload }).fontSans).toBe(defaultTheme.fontSans)
    }
  })

  it('rejects non-string and non-finite values for the right field kind', () => {
    expect(resolveTheme({ accent: 123 as unknown as string }).accent).toBe(defaultTheme.accent)
    expect(resolveTheme({ radius: '8px' as unknown as number }).radius).toBe(defaultTheme.radius)
    expect(resolveTheme({ radius: NaN }).radius).toBe(defaultTheme.radius)
  })

  it('returns the shared default object when given no partial', () => {
    expect(resolveTheme()).toBe(defaultTheme)
  })
})

describe('scriptLiteral', () => {
  it('neutralizes the HTML-significant characters', () => {
    expect(scriptLiteral('</script>')).toBe('"\\u003c/script\\u003e"')
    expect(scriptLiteral('a&b')).toBe('"a\\u0026b"')
    expect(scriptLiteral('<x>')).toBe('"\\u003cx\\u003e"')
  })

  it('escapes the JS line separators JSON.stringify leaves alone', () => {
    expect(scriptLiteral('\u2028\u2029')).toBe('"\\u2028\\u2029"')
  })

  it('is byte-identical to JSON.stringify when nothing needs escaping', () => {
    for (const v of ['G-ABC123', '', 'plain value', 'a/b/c']) {
      expect(scriptLiteral(v)).toBe(JSON.stringify(v))
    }
  })
})

describe('theme denylist hardening', () => {
  it('rejects the CSS comment opener', () => {
    // `red/*` would comment out the remainder of the <style> block.
    expect(resolveTheme({ accent: 'red/*' }).accent).toBe(defaultTheme.accent)
    expect(exportSiteToHTML(config({ accent: 'red/*' }))).not.toContain('red/*')
  })

  it('rejects the JS line separators', () => {
    const lineSeparator = String.fromCharCode(0x2028)
    expect(resolveTheme({ accent: `red${lineSeparator}` }).accent).toBe(defaultTheme.accent)
  })

  it('still allows a modern space-separated color, which legitimately contains a slash', () => {
    // Guards the deliberate choice to ban `*` rather than `/`: banning `/` would
    // reject valid modern color syntax for no security gain.
    const modernColor = 'rgb(255 0 0 / 50%)'
    expect(resolveTheme({ accent: modernColor }).accent).toBe(modernColor)
  })
})
