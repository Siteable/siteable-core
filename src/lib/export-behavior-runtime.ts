/**
 * Behavior runtime for exported pages.
 *
 * Every page with a navbar, faq, tabs, carousel or filter-active card grid block
 * gets ONE inline script (never a separate asset) that wires the behaviors through
 * delegated document listeners and performs no initialization work of its own:
 *  - menu: `data-sb-menu-toggle` toggles the element its `aria-controls` names
 *    through `hidden`, so nothing animates, with `aria-expanded` mirroring it;
 *    Escape closes the panel owning focus (else every open panel) and focuses it.
 *  - faq: a `button` followed by `.faq-content` keeps the legacy accordion — one
 *    open item per section, the open item closes, inline sizing.
 *  - tabs: `data-sb-tab` in a `data-sb-tablist` selects itself and shows the panel
 *    its `aria-controls` names, every tab mirrors it; arrows and Home/End move both.
 *  - carousel: `data-sb-carousel` pages one `data-sb-carousel-slide` at a time via
 *    prev/next; the ends do not loop (that control is `disabled`), Left/Right act
 *    only inside it, and no timer runs.
 *  - filter: `data-sb-filter-btn` inside a `data-sb-filter` scope sets its own
 *    `aria-pressed` and hides every `data-sb-category` card whose key differs; an
 *    empty key shows them all, and each scope stays independent of the others.
 *    `hidden` is what hides a card, so the renderer must keep display utilities
 *    off the card element and give every card the attribute, empty when uncategorised.
 *
 * The script is a plain string, not a TS function, so the emitted bytes never depend on
 * the build toolchain: pages are compared byte-for-byte against frozen baselines and a
 * test gzips this constant against a hard cap. Keep it compact and ES2017, keep the
 * runtime-toggled classes (`text-green`, `text-text-3`, `rotate-180`) here so a CSS scan
 * sees them, and import nothing so the worker bundle stays free of the editor layer.
 */

export const MENU_PANEL_ID_PREFIX = 'sb_menu_'
export const TAB_ID_PREFIX = 'sb_tabs_'
export const CAROUSEL_ID_PREFIX = 'sb_carousel_'

/** Per-document carousel region id — `_` never appears in a generated anchor id. */
export const carouselRegionId = (n: number): string => CAROUSEL_ID_PREFIX + n

export const BEHAVIOR_RUNTIME_SOURCE = [
  '(function(d,w){',
  "function rm(){return !!(w.matchMedia&&w.matchMedia('(prefers-reduced-motion: reduce)').matches)}",
  "function panelOf(b){return d.getElementById(b.getAttribute('aria-controls')||'')}",
  'function setMenu(b,open){var p=panelOf(b);if(!p)return;',
  "b.setAttribute('aria-expanded',open?'true':'false');p.hidden=!open}",
  'function faq(btn){',
  "var content=btn.nextElementSibling,chevron=btn.querySelector('.faq-chevron');",
  "var isOpen=btn.getAttribute('aria-expanded')==='true';",
  "var section=btn.closest('section');",
  "var items=section?section.querySelectorAll('[aria-expanded]'):[];",
  'for(var i=0;i<items.length;i++){',
  "var b=items[i],n=b.nextElementSibling,c=b.querySelector('.faq-chevron');",
  "b.setAttribute('aria-expanded','false');",
  "if(n){n.style.maxHeight='0';n.style.paddingBottom='0';if(rm())n.style.transition='none'}",
  "if(c){c.style.transform='';c.classList.remove('text-green');",
  "c.classList.remove('rotate-180');c.classList.add('text-text-3');",
  "if(rm())c.style.transition='none'}",
  '}',
  'if(!isOpen){',
  "btn.setAttribute('aria-expanded','true');",
  "if(content){content.style.maxHeight='500px';content.style.paddingBottom='1rem';",
  "if(rm())content.style.transition='none'}",
  "if(chevron){chevron.style.transform='rotate(180deg)';chevron.classList.add('text-green');",
  "chevron.classList.remove('text-text-3');if(rm())chevron.style.transition='none'}",
  '}',
  '}',
  "d.addEventListener('click',function(e){",
  'var t=e.target;if(!t||!t.closest)return;',
  "var b=t.closest('[data-sb-menu-toggle]');",
  "if(b){setMenu(b,b.getAttribute('aria-expanded')!=='true');return}",
  "b=t.closest('button');var n=b&&b.nextElementSibling;",
  "if(n&&n.classList.contains('faq-content'))faq(b);",
  '});',
  "d.addEventListener('keydown',function(e){",
  "if(e.key!=='Escape')return;",
  'var list=d.querySelectorAll(\'[data-sb-menu-toggle][aria-expanded="true"]\');',
  'if(!list.length)return;',
  'var active=d.activeElement,focus=null,i,p;',
  'for(i=0;i<list.length;i++){',
  'p=panelOf(list[i]);',
  'if(active&&(list[i]===active||(p&&p.contains(active))))focus=list[i];',
  '}',
  'if(focus){setMenu(focus,false);focus.focus();return}',
  '// The editor only receives Escape from inside its own nav, so it never',
  '// reaches this close-all fallback. It is a superset, not a divergence.',
  'for(i=0;i<list.length;i++)setMenu(list[i],false);',
  'list[0].focus();',
  '});',
  'function tabsOf(t){var l=t.closest(\'[data-sb-tablist]\');',
  "return l?l.querySelectorAll('[data-sb-tab]'):[]}",
  'function selectTab(t,move){var l=tabsOf(t),i,x,p,on;',
  'for(i=0;i<l.length;i++){',
  'x=l[i];on=x===t;',
  "x.setAttribute('aria-selected',on?'true':'false');x.tabIndex=on?0:-1;",
  "p=d.getElementById(x.getAttribute('aria-controls')||'');if(p)p.hidden=!on}",
  'if(move)t.focus()}',
  "d.addEventListener('click',function(e){",
  'var t=e.target,b=t&&t.closest&&t.closest(\'[data-sb-tab]\');',
  'if(b)selectTab(b,false)});',
  "d.addEventListener('keydown',function(e){",
  'if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;var t=e.target,b=t&&t.closest&&t.closest(\'[data-sb-tab]\');if(!b)return;',
  'var l=tabsOf(b),n=l.length,i=Array.prototype.indexOf.call(l,b),k=e.key,j=-1;',
  'if(!n)return;',
  "if(k==='ArrowRight')j=(i+1)%n;else if(k==='ArrowLeft')j=(i-1+n)%n;",
  "else if(k==='Home')j=0;else if(k==='End')j=n-1;",
  'if(j<0)return;e.preventDefault();selectTab(l[j],true)});',
  'function slidesOf(c){return c?c.querySelectorAll(\'[data-sb-carousel-slide]\'):[]}function shown(s){var i;for(i=0;i<s.length;i++)if(!s[i].hidden)return i;return 0}',
  'function showSlide(c,to,b){var s=slidesOf(c),i,n=s.length,p,x,o;if(!n)return;to=to<0?0:(to>n-1?n-1:to);for(i=0;i<n;i++)s[i].hidden=i!==to;p=c.querySelector(\'[data-sb-carousel-prev]\');x=c.querySelector(\'[data-sb-carousel-next]\');if(p)p.disabled=to===0;if(x)x.disabled=to===n-1;if(b&&b.disabled){o=b===p?x:p;if(o)o.focus()}}',
  "d.addEventListener('click',function(e){var t=e.target,b=t&&t.closest&&t.closest('[data-sb-carousel-prev],[data-sb-carousel-next]'),c;if(!b)return;c=b.closest('[data-sb-carousel]');if(!c)return;showSlide(c,shown(slidesOf(c))+(b.hasAttribute('data-sb-carousel-next')?1:-1),b)});",
  "d.addEventListener('keydown',function(e){var k=e.key,t=e.target,c;if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||(k!=='ArrowLeft'&&k!=='ArrowRight'))return;c=t&&t.closest&&t.closest('[data-sb-carousel]');if(!c)return;var s=slidesOf(c),to=shown(s)+(k==='ArrowRight'?1:-1);if(to<0||to>s.length-1)return;e.preventDefault();showSlide(c,to,t.closest('[data-sb-carousel-prev],[data-sb-carousel-next]'))});",
  "function filt(e){var t=e.target,b=t&&t.closest&&t.closest('[data-sb-filter-btn]'),g,k,l,i;",
  "if(!b||(e.type==='keydown'&&e.key!=='Enter'&&e.key!==' '))return;g=b.closest('[data-sb-filter]');if(!g)return;",
  "if(e.type==='keydown')e.preventDefault();k=b.getAttribute('data-sb-filter-btn');",
  "l=g.querySelectorAll('[data-sb-filter-btn]');for(i=0;i<l.length;i++)l[i].setAttribute('aria-pressed',l[i]===b?'true':'false');",
  "l=g.querySelectorAll('[data-sb-category]');for(i=0;i<l.length;i++)l[i].hidden=!!k&&l[i].getAttribute('data-sb-category')!==k}",
  "d.addEventListener('click',filt);d.addEventListener('keydown',filt);",
  '})(document,window);',
].join('\n')

export const BEHAVIOR_NOSCRIPT_CSS = [
  '[data-sb-menu-toggle]{display:none!important}',
  '@media (max-width:1023.98px){[data-sb-menu-panel]{display:block!important}}',
  '.faq-content{max-height:none!important;padding-bottom:1rem!important}',
  '.faq-chevron{display:none!important}',
].join('\n')

/**
 * Script-less stylesheet for tabs: with no script the panel markup is all the
 * visitor has, so the tab strip is dropped and every panel is shown as a plain
 * block. `!important` is required — the user agent's `[hidden]` rule is what
 * hides the panels in the scripted case, and only a weighted declaration beats
 * an author stylesheet's `display` utility.
 */
export const TABS_NOSCRIPT_CSS = [
  '[data-sb-tablist]{display:none!important}',
  '[data-sb-tab-panel],[data-sb-tab-title]{display:block!important}',
].join('\n')

/** Script-less carousel: controls dropped, every slide a block; `!important` beats `hidden`. */
export const CAROUSEL_NOSCRIPT_CSS = [
  '[data-sb-carousel-prev],[data-sb-carousel-next]{display:none!important}',
  '[data-sb-carousel-slide]{display:block!important}',
].join('\n')

export const carouselRules = CAROUSEL_NOSCRIPT_CSS // same literal, for the normalizers

/**
 * Script-less filter: with no script every card must stay visible, so the
 * button row is dropped. `!important` beats any utility class, the same way the
 * carousel controls are hidden.
 */
export const FILTER_NOSCRIPT_CSS = '[data-sb-filter-btn]{display:none!important}'

/** True for a navbar or faq block — the two widgets the runtime shipped with. */
function isMenuOrFaq(block: unknown): boolean {
  if (!block || typeof block !== 'object') return false
  const type = (block as { type?: unknown }).type
  return type === 'navbar' || type === 'faq'
}

/**
 * True for a features block that renders as a tab set: `display` must be exactly
 * `tabs` and the block must carry at least two items, because a single item has
 * nothing to switch between — exported so markup and predicate cannot disagree.
 */
export function isFeaturesTabSet(block: unknown): boolean {
  if (!block || typeof block !== 'object') return false
  const candidate = block as { type?: unknown; props?: unknown }
  if (candidate.type !== 'features') return false
  if (!candidate.props || typeof candidate.props !== 'object') return false
  const props = candidate.props as { display?: unknown; items?: unknown }
  return props.display === 'tabs' && Array.isArray(props.items) && props.items.length >= 2
}

/**
 * True for a testimonials or gallery block that renders as a carousel: `display` must
 * be exactly `carousel` and the list must hold at least two items, because a single
 * item has nothing to page between — exported so markup and predicate share one rule.
 */
export function isCarouselBlock(block: unknown): boolean {
  if (!block || typeof block !== 'object') return false
  const { type, props } = block as { type?: unknown; props?: unknown }
  if (type !== 'testimonials' && type !== 'gallery') return false
  if (!props || typeof props !== 'object') return false
  const candidate = props as { display?: unknown; items?: unknown; images?: unknown }
  if (candidate.display !== 'carousel') return false
  const list = type === 'testimonials' ? candidate.items : candidate.images
  return Array.isArray(list) && list.length >= 2
}

/**
 * Normalised category key: trimmed, lower-cased, with the characters that would
 * need escaping inside an HTML attribute percent-encoded. Percent-encoding the
 * reserved set keeps the mapping injective and total (it never throws, even on
 * a lone surrogate), and the result carries no `&`, angle bracket or quote, so
 * the renderer can place it inside a quoted attribute without escaping it again.
 */
export function cardGridCategoryKey(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .trim()
    .toLowerCase()
    .replace(/[%&<>"'`]/g, (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase())
}

/**
 * Distinct categories of a card-grid item list, in first-appearance order. Each
 * entry carries the key and the first-seen spelling as its label; whitespace-
 * only, non-string and non-object entries are skipped. The label is the raw
 * authored text and must be escaped on output. Exported so the renderer builds
 * its buttons from the same rule the predicate counts.
 */
export function cardGridCategories(items: unknown): Array<{ key: string; label: string }> {
  if (!Array.isArray(items)) return []
  const byKey = new Map<string, string>()
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const raw = (item as { category?: unknown }).category
    if (typeof raw !== 'string') continue
    const key = cardGridCategoryKey(raw)
    if (!key || byKey.has(key)) continue
    byKey.set(key, raw.trim())
  }
  return Array.from(byKey, ([key, label]) => ({ key, label }))
}

/**
 * True for a card grid that renders as a filtered product grid: `display` must
 * be exactly `filter` and the items must hold at least two distinct normalised
 * non-empty categories — exported so markup, script emission and the no-script
 * rules share one rule.
 */
export function isFilterCardGrid(block: unknown): boolean {
  if (!block || typeof block !== 'object') return false
  const candidate = block as { type?: unknown; props?: unknown }
  if (candidate.type !== 'card-grid') return false
  if (!candidate.props || typeof candidate.props !== 'object') return false
  const props = candidate.props as { display?: unknown; items?: unknown }
  if (props.display !== 'filter') return false
  return cardGridCategories(props.items).length >= 2
}

/** True when a page document contains at least one behavior-owning block. */
export function needsBehaviorRuntime(blocks: unknown): boolean {
  if (!Array.isArray(blocks)) return false
  return blocks.some((block) => isMenuOrFaq(block) || isFeaturesTabSet(block) || isCarouselBlock(block) || isFilterCardGrid(block))
}

/**
 * Inline script tag carrying the runtime, or an empty string when unused. Call at
 * most once per exported document: the source installs delegated listeners and is
 * not idempotent.
 */
export function renderBehaviorScript(): string {
  return '\n    <script data-sb-runtime>' + BEHAVIOR_RUNTIME_SOURCE + '</script>'
}

/**
 * No-script fallback stylesheet, holding the rules only for the widgets the page
 * actually renders, in a fixed order (menu/faq, tabs, carousel, filter). Called
 * without a block list it emits the menu and faq rules unconditionally — the
 * exact 0.4.0 bytes.
 */
export function renderBehaviorNoscript(blocks?: unknown): string {
  if (blocks === undefined) return '\n  <noscript><style>' + BEHAVIOR_NOSCRIPT_CSS + '</style></noscript>'
  if (!Array.isArray(blocks)) return ''
  const rules: string[] = []
  if (blocks.some((block) => isMenuOrFaq(block))) rules.push(BEHAVIOR_NOSCRIPT_CSS)
  if (blocks.some((block) => isFeaturesTabSet(block))) rules.push(TABS_NOSCRIPT_CSS)
  if (blocks.some((block) => isCarouselBlock(block))) rules.push(carouselRules)
  if (blocks.some((block) => isFilterCardGrid(block))) rules.push(FILTER_NOSCRIPT_CSS)
  if (rules.length === 0) return ''
  return '\n  <noscript><style>' + rules.join('\n') + '</style></noscript>'
}
