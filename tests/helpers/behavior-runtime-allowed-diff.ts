/**
 * Allowed-difference normalizers for the frozen legacy export baselines.
 *
 * A page with a navbar or faq legitimately differs from its frozen snapshot by
 * exactly five things: the inline runtime script, the no-script stylesheet, the
 * menu button's attribute run, the menu panel element, and the removal of the
 * legacy inline FAQ function plus its `onclick` attributes. Block-id attributes
 * are handled separately by the calling suite.
 *
 * These helpers remove ONLY those additions. They are deliberately literal
 * (the exact emitted strings) and bounded by literal start/end markers, so no
 * regex can match arbitrary markup. They report strip counts so a no-op cannot
 * pass a test that expects a populated page.
 */
import {
  renderBehaviorNoscript,
  renderBehaviorScript,
} from '../../src/lib/export-behavior-runtime'

export interface RuntimeStripCounts {
  scripts: number
  noscript: number
  toggleAttrs: number
  panels: number
}

export interface LegacyFaqStripCounts {
  scripts: number
  onclick: number
  toggleFaq: number
}

export interface StripResult<Counts> {
  html: string
  counts: Counts
}

const TOGGLE_ATTR_SOURCE =
  ' type="button" data-sb-menu-toggle aria-label="Toggle menu" aria-expanded="false" aria-controls="sb_menu_\\d+"'
const PANEL_SOURCE =
  '\\n  <div id="sb_menu_\\d+" data-sb-menu-panel hidden class="[^"]*">\\n    <div class="flex flex-col gap-3 [^"]*">\\n[\\s\\S]*?\\n    </div>\\n  </div>'

/**
 * The legacy FAQ function exactly as the 0.2.0 exporter emitted it. FROZEN:
 * never reformat or re-indent it and never follow an exporter change — the
 * snapshot file is the source of truth, and `scripts: 1` below is the tripwire.
 */
const LEGACY_FAQ_SCRIPT = `
    <script>
      function toggleFaq(btn) {
        var content = btn.nextElementSibling;
        var chevron = btn.querySelector('.faq-chevron');
        var isOpen = btn.getAttribute('aria-expanded') === 'true';

        // Close all
        var items = btn.closest('section').querySelectorAll('[aria-expanded]');
        items.forEach(function(b) {
          b.setAttribute('aria-expanded', 'false');
          b.nextElementSibling.style.maxHeight = '0';
          b.nextElementSibling.style.paddingBottom = '0';
          var c = b.querySelector('.faq-chevron');
          if (c) { c.style.transform = ''; c.classList.remove('text-green'); c.classList.add('text-text-3'); }
        });

        // Toggle current
        if (!isOpen) {
          btn.setAttribute('aria-expanded', 'true');
          content.style.maxHeight = '500px';
          content.style.paddingBottom = '1rem';
          if (chevron) { chevron.style.transform = 'rotate(180deg)'; chevron.classList.add('text-green'); chevron.classList.remove('text-text-3'); }
        }
      }
    </script>`

const LEGACY_FAQ_ONCLICK = ' onclick="toggleFaq(this)"'

function removeAll(html: string, literal: string): { html: string; count: number } {
  if (!literal) return { html, count: 0 }
  const parts = html.split(literal)
  return { html: parts.join(''), count: parts.length - 1 }
}

/** Remove the runtime script, the noscript block, the menu attributes and panels. */
export function stripRuntimeAdditions(html: string): StripResult<RuntimeStripCounts> {
  const script = removeAll(html, renderBehaviorScript())
  const noscript = removeAll(script.html, renderBehaviorNoscript())

  const toggleAttrRe = new RegExp(TOGGLE_ATTR_SOURCE, 'g')
  const toggleAttrs = (noscript.html.match(toggleAttrRe) ?? []).length

  const panelRe = new RegExp(PANEL_SOURCE, 'g')
  const panels = (noscript.html.match(panelRe) ?? []).length

  const stripped = noscript.html
    .replace(new RegExp(TOGGLE_ATTR_SOURCE, 'g'), '')
    .replace(new RegExp(PANEL_SOURCE, 'g'), '')

  return {
    html: stripped,
    counts: { scripts: script.count, noscript: noscript.count, toggleAttrs, panels },
  }
}

/** Remove the legacy inline FAQ function and every legacy `onclick`. */
export function stripLegacyFaq(html: string): StripResult<LegacyFaqStripCounts> {
  const toggleFaq = (html.match(/toggleFaq/g) ?? []).length

  const script = removeAll(html, LEGACY_FAQ_SCRIPT)
  const attrs = removeAll(script.html, LEGACY_FAQ_ONCLICK)

  return {
    html: attrs.html,
    counts: { scripts: script.count, onclick: attrs.count, toggleFaq },
  }
}
