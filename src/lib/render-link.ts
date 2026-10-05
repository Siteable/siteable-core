import { escapeHtml } from './html-escape'
import { isAllowedUrl } from './url-policy'

/**
 * Render a link as an `<a>` when (and only when) `url` passes the link policy,
 * otherwise as a `<span>` carrying the same classes. This is the single policy
 * chokepoint for every navigational link the exporter emits (FR-001).
 */
export function renderLink(text: string, url?: string, className?: string): string {
  const cls = className ? ` class="${escapeHtml(className)}"` : ''
  const escaped = escapeHtml(text)
  if (url && isAllowedUrl(url)) {
    return `<a href="${escapeHtml(url)}"${cls}>${escaped}</a>`
  }
  return `<span${cls}>${escaped}</span>`
}
