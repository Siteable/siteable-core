/**
 * Serialize a value for safe embedding inside an inline `<script>` element.
 *
 * `JSON.stringify` alone is NOT sufficient in an HTML script context. It escapes
 * `"` and `\` but leaves `/` untouched, so a value containing `</script>`
 * terminates the script element early and the remainder is re-parsed as markup —
 * a stored-XSS sink. `>` and `&` are similarly meaningful to the HTML tokenizer.
 *
 * The JS line separators (U+2028, U+2029) are the third gap: a JS parser treats
 * them as line terminators while JSON treats them as ordinary characters, which
 * is why `JSON.stringify` leaves them alone and a raw one would break the
 * emitted script.
 *
 * Escaping all five keeps the output a valid JS literal that is inert in every
 * inline-script context. A value containing none of those characters serializes
 * byte-identically to plain `JSON.stringify`, so existing configs are unaffected.
 *
 * The line-separator matcher is built from char codes rather than written as a
 * regex literal so this file contains no backslash-u escape sequence that a
 * tool or editor could resolve into the literal character it is meant to match.
 *
 * Note this neutralizes the *value*; it does not decide whether the value should
 * be emitted at all. URL props are gated separately by `isAllowedUrl`, and text
 * runs by `escapeHtml`.
 */
const LINE_SEPARATOR = new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`, 'g')
const LS_ESCAPE = '\\u2028'
const PS_ESCAPE = '\\u2029'

export function scriptLiteral(value: unknown): string {
  return JSON.stringify(value ?? '')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEPARATOR, (m) => (m.charCodeAt(0) === 0x2028 ? LS_ESCAPE : PS_ESCAPE))
}
