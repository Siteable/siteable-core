/**
 * Behavior runtime for exported pages.
 *
 * The exporter ships this script inline to every page that carries a navbar or
 * faq block. These tests pin the contract the exporter depends on:
 *  - the emission predicate is true only for pages with a navbar or faq block,
 *    and tolerates malformed block lists,
 *  - the whole runtime stays under the 5 KB gzip budget,
 *  - the emitted bytes are pinned by a hash: the source is deliberately a
 *    hand-written constant, so any byte change must be an explicit decision,
 *  - the source never builds HTML from a string and never evaluates code,
 *  - the embedded bytes cannot terminate their own script tag or open a comment,
 *  - the no-script stylesheet carries every override with `!important`,
 *  - runtime-toggled classes live in this one file so a future CSS scan sees them,
 *  - the source actually runs: menu toggle, Escape/focus and the faq accordion
 *    behave as the legacy markup did.
 */
import { afterEach, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import {
  BEHAVIOR_RUNTIME_SOURCE,
  BEHAVIOR_NOSCRIPT_CSS,
  MENU_PANEL_ID_PREFIX,
  needsBehaviorRuntime,
  renderBehaviorScript,
  renderBehaviorNoscript,
} from '../src/lib/export-behavior-runtime'

const SIZE_CAP_BYTES = 5120

/**
 * Intentional byte pin. Update ONLY when an emitted-bytes change is intended;
 * a green suite plus a silently drifted source is exactly the failure this
 * guards against.
 */
const SOURCE_SHA256 = '41ba122a40d634020e6e44a1dad424c1f6136c53b2d57447aa5576bd2fc3a775'

describe('needsBehaviorRuntime — per-page emission predicate', () => {
  it.each([
    ['a navbar block', [{ id: 'nav', type: 'navbar' }], true],
    ['a faq block', [{ id: 'faq', type: 'faq' }], true],
    ['both blocks', [{ type: 'hero' }, { type: 'navbar' }, { type: 'faq' }], true],
    ['neither block', [{ type: 'hero' }, { type: 'footer' }], false],
    ['an empty page', [], false],
    ['a non-array value', { type: 'navbar' }, false],
    ['a missing value', undefined, false],
    ['a null value', null, false],
    ['a string value', 'navbar', false],
  ])('returns the right verdict for %s', (_label, blocks, expected) => {
    expect(needsBehaviorRuntime(blocks)).toBe(expected)
  })

  it('tolerates non-object entries inside the block list', () => {
    expect(needsBehaviorRuntime([null, undefined, 42, 'faq', [], { type: 'navbar' }])).toBe(true)
    expect(needsBehaviorRuntime([null, undefined, 42, 'faq', []])).toBe(false)
  })

  it('treats the block type as case-sensitive', () => {
    expect(needsBehaviorRuntime([{ type: 'Navbar' }])).toBe(false)
  })
})

describe('BEHAVIOR_RUNTIME_SOURCE — size, bytes and safety', () => {
  it('stays within the 5 KB gzip budget', () => {
    const gzipBytes = gzipSync(Buffer.from(BEHAVIOR_RUNTIME_SOURCE, 'utf8')).length
    expect(gzipBytes).toBeLessThanOrEqual(SIZE_CAP_BYTES)
  })

  it('matches the pinned byte hash', () => {
    const digest = createHash('sha256').update(BEHAVIOR_RUNTIME_SOURCE, 'utf8').digest('hex')
    expect(digest).toBe(SOURCE_SHA256)
  })

  it.each([
    ['innerHTML', /\binnerHTML\b/],
    ['outerHTML', /\bouterHTML\b/],
    ['insertAdjacentHTML', /\binsertAdjacentHTML\b/],
    ['document.write', /document\s*\.\s*write/],
    ['eval()', /\beval\s*\(/],
    ['Function()', /\bFunction\s*\(/],
    ['a string argument to setTimeout', /\bsetTimeout\s*\(\s*['"`]/],
    ['a string argument to setInterval', /\bsetInterval\s*\(\s*['"`]/],
  ])('contains no %s', (_label, pattern) => {
    expect(BEHAVIOR_RUNTIME_SOURCE).not.toMatch(pattern)
  })

  it('cannot terminate its own script tag or open an HTML comment', () => {
    expect(BEHAVIOR_RUNTIME_SOURCE.toLowerCase()).not.toContain('</script')
    expect(BEHAVIOR_RUNTIME_SOURCE).not.toContain('<!--')
  })

  it('parses as JavaScript', () => {
    expect(() => new Function(BEHAVIOR_RUNTIME_SOURCE)).not.toThrow()
  })

  it('is a self-invoking function that receives document and window', () => {
    expect(BEHAVIOR_RUNTIME_SOURCE.trimStart().startsWith('(function(d,w){')).toBe(true)
    expect(BEHAVIOR_RUNTIME_SOURCE.trimEnd().endsWith('})(document,window);')).toBe(true)
  })

  it.each(['text-green', 'text-text-3', 'rotate-180'])(
    'keeps the runtime-toggled class %s in the source',
    (className) => {
      expect(BEHAVIOR_RUNTIME_SOURCE).toContain(className)
    },
  )
})

describe('BEHAVIOR_NOSCRIPT_CSS — script-less fallback', () => {
  it.each([
    '[data-sb-menu-toggle]',
    '[data-sb-menu-panel]',
    '.faq-content',
    '.faq-chevron',
  ])('styles %s', (selector) => {
    expect(BEHAVIOR_NOSCRIPT_CSS).toContain(selector)
  })

  it('marks every declaration important so it wins over utility classes', () => {
    const rules = BEHAVIOR_NOSCRIPT_CSS.match(/[^{}]+\{[^{}]*\}/g) ?? []
    expect(rules.length).toBeGreaterThanOrEqual(4)
    for (const rule of rules) {
      const declarations = rule.slice(rule.indexOf('{') + 1, rule.lastIndexOf('}')).split(';')
      for (const declaration of declarations) {
        if (declaration.trim()) expect(declaration).toContain('!important')
      }
    }
  })

  it('shows the menu panel only below the desktop breakpoint', () => {
    expect(BEHAVIOR_NOSCRIPT_CSS).toContain('@media (max-width:1023.98px)')
  })
})

describe('emitters', () => {
  it('uses the reserved panel id prefix', () => {
    expect(MENU_PANEL_ID_PREFIX).toBe('sb_menu_')
  })

  it('renders the runtime inside exactly one inline script tag', () => {
    const html = renderBehaviorScript()
    expect(html).toContain('<script data-sb-runtime>')
    expect(html).toContain(BEHAVIOR_RUNTIME_SOURCE)
    expect(html.match(/<script/g)).toHaveLength(1)
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(html.trimEnd().endsWith('</script>')).toBe(true)
  })

  it('renders the fallback stylesheet inside exactly one noscript block', () => {
    const html = renderBehaviorNoscript()
    expect(html).toContain('<noscript><style>')
    expect(html).toContain(BEHAVIOR_NOSCRIPT_CSS)
    expect(html.match(/<noscript>/g)).toHaveLength(1)
    expect(html.match(/<\/noscript>/g)).toHaveLength(1)
    expect(html.trimEnd().endsWith('</style></noscript>')).toBe(true)
  })
})

describe('runtime source behavior', () => {
  const markup = [
    '<button id="toggle-a" data-sb-menu-toggle aria-controls="sb_menu_1" aria-expanded="false">A</button>',
    '<div id="sb_menu_1" data-sb-menu-panel hidden><a id="link-a" href="#x">X</a></div>',
    '<button id="toggle-b" data-sb-menu-toggle aria-controls="sb_menu_2" aria-expanded="false">B</button>',
    '<div id="sb_menu_2" data-sb-menu-panel hidden><a href="#y">Y</a></div>',
    '<input id="elsewhere" type="text" />',
    '<section id="faq-section">',
    '<button id="faq-1" aria-expanded="true"><span>Q1</span>',
    '<span class="faq-chevron text-green rotate-180">v</span></button>',
    '<div class="faq-content max-h-[500px]"><p>First answer</p></div>',
    '<button id="faq-2" aria-expanded="false"><span>Q2</span>',
    '<span class="faq-chevron text-text-3">v</span></button>',
    '<div class="faq-content max-h-0"><p>Second answer</p></div>',
    '</section>',
  ].join('')

  const byId = (id: string): HTMLElement => document.getElementById(id) as HTMLElement
  const click = (el: Element): void => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }
  const content = (id: string): HTMLElement => byId(id).nextElementSibling as HTMLElement
  const chevron = (id: string): HTMLElement => byId(id).querySelector('.faq-chevron') as HTMLElement
  const pressEscape = (): void => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  }
  const reducedMotion = (): void => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }))
  }

  beforeAll(() => {
    // Evaluated once for the whole file: the runtime installs delegated
    // document listeners and performs no per-page initialization work.
    new Function(BEHAVIOR_RUNTIME_SOURCE)()
  })

  beforeEach(() => {
    document.body.innerHTML = markup
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens the panel a button controls and flips its expanded state', () => {
    click(byId('toggle-a'))
    expect(byId('toggle-a').getAttribute('aria-expanded')).toBe('true')
    expect(byId('sb_menu_1').hidden).toBe(false)
  })

  it('keeps a second navbar independent of the first', () => {
    click(byId('toggle-a'))
    click(byId('toggle-b'))
    expect(byId('toggle-b').getAttribute('aria-expanded')).toBe('true')
    expect(byId('sb_menu_2').hidden).toBe(false)
    expect(byId('toggle-a').getAttribute('aria-expanded')).toBe('true')
    expect(byId('sb_menu_1').hidden).toBe(false)
  })

  it('closes the panel that owns focus on Escape and returns focus to its button', () => {
    click(byId('toggle-a'))
    click(byId('toggle-b'))
    byId('link-a').focus()
    pressEscape()
    expect(byId('toggle-a').getAttribute('aria-expanded')).toBe('false')
    expect(byId('sb_menu_1').hidden).toBe(true)
    expect(byId('toggle-b').getAttribute('aria-expanded')).toBe('true')
    expect(byId('sb_menu_2').hidden).toBe(false)
    expect(document.activeElement).toBe(byId('toggle-a'))
  })

  it('closes the panel when its own button owns focus', () => {
    click(byId('toggle-a'))
    click(byId('toggle-b'))
    byId('toggle-b').focus()
    pressEscape()
    expect(byId('toggle-b').getAttribute('aria-expanded')).toBe('false')
    expect(byId('sb_menu_2').hidden).toBe(true)
    expect(byId('toggle-a').getAttribute('aria-expanded')).toBe('true')
    expect(byId('sb_menu_1').hidden).toBe(false)
    expect(document.activeElement).toBe(byId('toggle-b'))
  })

  it('closes every open panel and focuses the first when Escape is pressed elsewhere', () => {
    click(byId('toggle-a'))
    click(byId('toggle-b'))
    byId('elsewhere').focus()
    pressEscape()
    expect(byId('toggle-a').getAttribute('aria-expanded')).toBe('false')
    expect(byId('toggle-b').getAttribute('aria-expanded')).toBe('false')
    expect(byId('sb_menu_1').hidden).toBe(true)
    expect(byId('sb_menu_2').hidden).toBe(true)
    expect(document.activeElement).toBe(byId('toggle-a'))
  })

  it('closes the open faq item and opens the clicked one (single item per section)', () => {
    // Click the chevron child: delegation must resolve to the owning button.
    click(chevron('faq-2'))
    expect(byId('faq-2').getAttribute('aria-expanded')).toBe('true')
    expect(content('faq-2').style.maxHeight).toBe('500px')
    expect(content('faq-2').style.paddingBottom).toBe('1rem')
    expect(chevron('faq-2').style.transform).toBe('rotate(180deg)')
    expect(chevron('faq-2').classList.contains('text-green')).toBe(true)
    expect(chevron('faq-2').classList.contains('text-text-3')).toBe(false)

    expect(byId('faq-1').getAttribute('aria-expanded')).toBe('false')
    expect(content('faq-1').style.maxHeight).toBe('0px')
    expect(chevron('faq-1').style.transform).toBe('')
    expect(chevron('faq-1').classList.contains('rotate-180')).toBe(false)
    expect(chevron('faq-1').classList.contains('text-green')).toBe(false)
    expect(chevron('faq-1').classList.contains('text-text-3')).toBe(true)
  })

  it('closes the open faq item when it is clicked again', () => {
    click(byId('faq-1'))
    expect(byId('faq-1').getAttribute('aria-expanded')).toBe('false')
    expect(content('faq-1').style.maxHeight).toBe('0px')
    expect(content('faq-1').style.paddingBottom).toBe('0px')
    expect(chevron('faq-1').classList.contains('rotate-180')).toBe(false)
    expect(chevron('faq-1').classList.contains('text-green')).toBe(false)
    expect(chevron('faq-1').classList.contains('text-text-3')).toBe(true)
  })

  it('drops the transition when the visitor prefers reduced motion', () => {
    reducedMotion()
    click(byId('faq-2'))
    expect(content('faq-2').style.transition).toBe('none')
    expect(chevron('faq-2').style.transition).toBe('none')
  })
})
