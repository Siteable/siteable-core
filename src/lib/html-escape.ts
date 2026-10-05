/**
 * Single HTML-escape implementation, shared by the exporter's block renderers
 * and the markdown-subset renderer (NF-006: no new dependency).
 *
 * Every literal text run in an emitted string MUST pass through this function
 * before it is concatenated into markup. `isAllowedUrl` decides whether a URL
 * may be emitted at all; this function decides how it is rendered. Both are
 * required — escaping alone does not neutralize a scheme, and a policy check
 * alone does not neutralize a quote inside an allowed URL.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
