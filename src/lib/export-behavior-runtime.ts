/**
 * Behavior runtime for exported pages.
 *
 * Every exported page that contains a navbar, faq or tabs block gets ONE inline
 * script (never a separate asset) that wires the behaviors through delegated
 * document listeners, so it performs no initialization work of its own:
 *
 *  - menu: a button carrying `data-sb-menu-toggle` toggles the element named by
 *    its `aria-controls` id. The panel is hidden through the `hidden`
 *    attribute, so nothing animates; `aria-expanded` mirrors the state. Escape
 *    closes the panel that owns focus and returns focus to its button; when no
 *    open panel owns focus it closes every open panel and focuses the first.
 *  - faq: a `button` whose next sibling is `.faq-content` keeps the legacy
 *    accordion semantics — one item open per section, clicking the open item
 *    closes it, `aria-expanded` per button, inline max-height and padding.
 *  - tabs: a button carrying `data-sb-tab` inside a `data-sb-tablist` selects
 *    itself and shows the panel its `aria-controls` names. Arrow keys and
 *    Home/End move the selection and the focus together; every tab of the set
 *    mirrors the state, so a tab list never depends on a class or a CSS rule to
 *    show which panel is open.
 *
 * The script is held as a plain string rather than a TypeScript function so the
 * emitted bytes never depend on the build toolchain: exported pages are
 * compared byte-for-byte against frozen baselines, and a test gzips this
 * constant against a hard cap. Keep it hand-compact and ES2017.
 *
 * Classes toggled at runtime (`text-green`, `text-text-3`, `rotate-180`) live
 * in this file on purpose: a future CSS build scans this one module for the
 * class names it must preserve.
 *
 * This module imports nothing. It reaches the worker bundle through the
 * exporter, so any import — even a relative one — would drag the editor layer
 * into a framework-free build.
 */

export const MENU_PANEL_ID_PREFIX = 'sb_menu_'
export const TAB_ID_PREFIX = 'sb_tabs_'

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
  'var t=e.target,b=t&&t.closest&&t.closest(\'[data-sb-tab]\');if(!b)return;',
  'var l=tabsOf(b),n=l.length,i=Array.prototype.indexOf.call(l,b),k=e.key,j=-1;',
  'if(!n)return;',
  "if(k==='ArrowRight')j=(i+1)%n;else if(k==='ArrowLeft')j=(i-1+n)%n;",
  "else if(k==='Home')j=0;else if(k==='End')j=n-1;",
  'if(j<0)return;e.preventDefault();selectTab(l[j],true)});',
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

/** True for a navbar or faq block — the two widgets the runtime shipped with. */
function isMenuOrFaq(block: unknown): boolean {
  if (!block || typeof block !== 'object') return false
  const type = (block as { type?: unknown }).type
  return type === 'navbar' || type === 'faq'
}

/**
 * True for a features block that renders as a tab set: `display` must be the
 * exact string `tabs` and the block must carry at least two items, because a
 * single item has nothing to switch between. Exported so the exporter markup
 * and this predicate can never disagree about what counts as a tab set.
 */
export function isFeaturesTabSet(block: unknown): boolean {
  if (!block || typeof block !== 'object') return false
  const candidate = block as { type?: unknown; props?: unknown }
  if (candidate.type !== 'features') return false
  if (!candidate.props || typeof candidate.props !== 'object') return false
  const props = candidate.props as { display?: unknown; items?: unknown }
  return props.display === 'tabs' && Array.isArray(props.items) && props.items.length >= 2
}

/** True when a page document contains at least one behavior-owning block. */
export function needsBehaviorRuntime(blocks: unknown): boolean {
  if (!Array.isArray(blocks)) return false
  return blocks.some((block) => isMenuOrFaq(block) || isFeaturesTabSet(block))
}

/**
 * Inline script tag carrying the runtime, or an empty string when unused.
 * Call at most once per exported document: the source installs delegated
 * listeners and is not idempotent.
 */
export function renderBehaviorScript(): string {
  return '\n    <script data-sb-runtime>' + BEHAVIOR_RUNTIME_SOURCE + '</script>'
}

/**
 * No-script fallback stylesheet, holding the rules only for the widgets the
 * page actually renders. Called without a block list it emits the menu and faq
 * rules unconditionally, which is the exact byte string the frozen 0.4.0
 * baselines were captured with.
 */
export function renderBehaviorNoscript(blocks?: unknown): string {
  if (blocks === undefined) {
    return '\n  <noscript><style>' + BEHAVIOR_NOSCRIPT_CSS + '</style></noscript>'
  }
  if (!Array.isArray(blocks)) return ''
  const rules: string[] = []
  if (blocks.some((block) => isMenuOrFaq(block))) rules.push(BEHAVIOR_NOSCRIPT_CSS)
  if (blocks.some((block) => isFeaturesTabSet(block))) rules.push(TABS_NOSCRIPT_CSS)
  if (rules.length === 0) return ''
  return '\n  <noscript><style>' + rules.join('\n') + '</style></noscript>'
}
