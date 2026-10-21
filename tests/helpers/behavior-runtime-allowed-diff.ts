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
  carouselRules,
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

const RUNTIME_SCRIPT_OPEN = '<script data-sb-runtime>'
const SCRIPT_CLOSE = '</script>'

/**
 * Empty the text of the runtime script element, keeping the element itself.
 *
 * A frozen export baseline holds the runtime source AS IT WAS EMITTED THEN, so
 * once that source changes there is no literal left to strip: `stripRuntimeAdditions`
 * can only ever remove the current one. This rule is the comparison that
 * survives the change — it blanks the script text on BOTH sides and leaves every
 * other byte in the document compared.
 *
 * Bounded by literal markers rather than a regex: the start marker is literal and
 * the text runs to the FIRST `</script>`, so the rule cannot run past the element
 * while that marker is present — which is the case that matters, since an
 * emitted script cannot contain a bare `</script>` in its body. If the marker is
 * MISSING the loop exits and the remainder is left compared rather than
 * truncated, so an exporter that loses the close tag fails the comparison loudly
 * instead of silently hiding the elements in between. The count is returned so a
 * no-op strip cannot pass a test that expects a populated page.
 */
export function stripRuntimeScriptText(html: string): StripResult<{ scripts: number }> {
  let out = ''
  let rest = html
  let scripts = 0

  for (;;) {
    const start = rest.indexOf(RUNTIME_SCRIPT_OPEN)
    if (start === -1) break
    const bodyStart = start + RUNTIME_SCRIPT_OPEN.length
    const end = rest.indexOf(SCRIPT_CLOSE, bodyStart)
    // A missing close tag leaves the remainder compared rather than truncating
    // it: swallowing everything after the marker would hide whatever markup sits
    // in between. The failure is asymmetric on purpose — anything already
    // stripped stays stripped, and the unterminated tail is reported as-is.
    if (end === -1) break

    out += rest.slice(0, bodyStart)
    rest = rest.slice(end)
    scripts += 1
  }

  return { html: out + rest, counts: { scripts } }
}

/**
 * Remove the carousel rules from a no-script block, counting the strip.
 *
 * A page that renders a carousel gains these rules on their own line, after the
 * menu/faq rules the released export already emitted. They are the ONLY addition
 * this rule tolerates: the frozen document has no carousel, so everything else in
 * it stays compared. Bounded by the literal emitted string rather than a regex —
 * the runtime source quotes the same two selectors but not their declarations, so
 * the bare literal cannot match there.
 */
export function stripCarouselRules(html: string): StripResult<{ carouselRules: number }> {
  const lines = removeAll(html, '\n' + carouselRules)
  const bare = removeAll(lines.html, carouselRules)
  return { html: bare.html, counts: { carouselRules: lines.count + bare.count } }
}
