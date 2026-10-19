/**
 * Behavior runtime for exported pages.
 *
 * Every exported page that contains a navbar or faq block gets ONE inline
 * script (never a separate asset) that wires two behaviors through delegated
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
  '})(document,window);',
].join('\n')

export const BEHAVIOR_NOSCRIPT_CSS = [
  '[data-sb-menu-toggle]{display:none!important}',
  '@media (max-width:1023.98px){[data-sb-menu-panel]{display:block!important}}',
  '.faq-content{max-height:none!important;padding-bottom:1rem!important}',
  '.faq-chevron{display:none!important}',
].join('\n')

/** True when a page document contains at least one behavior-owning block. */
export function needsBehaviorRuntime(blocks: unknown): boolean {
  if (!Array.isArray(blocks)) return false
  return blocks.some((block) => {
    if (!block || typeof block !== 'object') return false
    const type = (block as { type?: unknown }).type
    return type === 'navbar' || type === 'faq'
  })
}

/**
 * Inline script tag carrying the runtime, or an empty string when unused.
 * Call at most once per exported document: the source installs delegated
 * listeners and is not idempotent.
 */
export function renderBehaviorScript(): string {
  return '\n    <script data-sb-runtime>' + BEHAVIOR_RUNTIME_SOURCE + '</script>'
}

/** No-script fallback stylesheet for the menu and faq behaviors. */
export function renderBehaviorNoscript(): string {
  return '\n  <noscript><style>' + BEHAVIOR_NOSCRIPT_CSS + '</style></noscript>'
}
