/**
 * Category filter for exported card grids — predicate, emission and handler.
 *
 * One exported predicate decides whether a card grid renders as a filter grid,
 * so the renderer, the script emission and the no-script rules cannot disagree.
 * The category key is trimmed, lower-cased and percent-encodes the characters
 * that would need escaping inside an attribute, which keeps it injective and
 * total (no input throws). The handler itself is delegated, performs no
 * load-time initialization, and only compares strings: it never lower-cases.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import {
  BEHAVIOR_NOSCRIPT_CSS,
  BEHAVIOR_RUNTIME_SOURCE,
  CAROUSEL_NOSCRIPT_CSS,
  FILTER_NOSCRIPT_CSS,
  TABS_NOSCRIPT_CSS,
  cardGridCategories,
  cardGridCategoryKey,
  isFilterCardGrid,
  needsBehaviorRuntime,
  renderBehaviorNoscript,
} from '../src/lib/export-behavior-runtime'
import { checkRuntimeSegments } from './helpers/runtime-segment-subsequence'

const filterGrid = {
  type: 'card-grid',
  props: { display: 'filter', items: [{ category: 'Shoes' }, { category: 'Bags' }] },
}
const plainGrid = {
  type: 'card-grid',
  props: { items: [{ category: 'Shoes' }, { category: 'Bags' }] },
}
const oneCategoryGrid = {
  type: 'card-grid',
  props: { display: 'filter', items: [{ category: 'Shoes' }, { category: 'shoes ' }] },
}
const navbar = { type: 'navbar' }
const tabSet = { type: 'features', props: { display: 'tabs', items: [{}, {}] } }
const carousel = { type: 'gallery', props: { display: 'carousel', images: [{}, {}] } }

describe('cardGridCategoryKey — normalised, attribute-safe key', () => {
  it.each([
    ['Shoes', 'shoes'],
    ['  Shoes  ', 'shoes'],
    ['sHoEs', 'shoes'],
    ['shoes', 'shoes'],
    ['a&b', 'a%26b'],
    ['a<b', 'a%3Cb'],
    ['a>b', 'a%3Eb'],
    ['a"b', 'a%22b'],
    ["a'b", 'a%27b'],
    ['a`b', 'a%60b'],
    ['a%b', 'a%25b'],
  ])('maps %s to %s', (input, expected) => {
    expect(cardGridCategoryKey(input)).toBe(expected)
  })

  it('is injective for the reserved characters', () => {
    expect(cardGridCategoryKey('a&b')).not.toBe(cardGridCategoryKey('a%26b'))
    expect(cardGridCategoryKey('a&b')).not.toBe(cardGridCategoryKey('ab'))
  })

  it('produces keys with no attribute-breaking characters', () => {
    const charset = /^[^&<>"'`]*$/
    for (const input of ['plain', 'a&b', 'a<b', 'a>b', 'a"b', "a'b", 'a`b', 'a%b', '  MIXED case  ']) {
      expect(cardGridCategoryKey(input)).toMatch(charset)
    }
  })

  it('returns the empty key for non-string input', () => {
    expect(cardGridCategoryKey(undefined)).toBe('')
    expect(cardGridCategoryKey(null)).toBe('')
    expect(cardGridCategoryKey(7)).toBe('')
    expect(cardGridCategoryKey({})).toBe('')
  })

  it('never throws on a lone surrogate or a very long value', () => {
    expect(() => cardGridCategoryKey('\uD800x')).not.toThrow()
    expect(typeof cardGridCategoryKey('\uD800x')).toBe('string')
    const long = 'A'.repeat(10000)
    expect(cardGridCategoryKey(long)).toHaveLength(10000)
  })
})

describe('cardGridCategories — ordered distinct categories', () => {
  it('keeps first-seen order and the first-seen spelling as label', () => {
    expect(
      cardGridCategories([
        { category: 'Shoes' },
        { category: ' shoes ' },
        { category: 'SHOES' },
        { category: 'Bags' },
      ]),
    ).toEqual([
      { key: 'shoes', label: 'Shoes' },
      { key: 'bags', label: 'Bags' },
    ])
  })

  it('skips whitespace-only, non-string and non-object entries', () => {
    expect(
      cardGridCategories([null, 'x', 42, [], { category: '   ' }, { category: 7 }, { category: 'Shoes' }]),
    ).toEqual([{ key: 'shoes', label: 'Shoes' }])
  })

  it('skips items without a category', () => {
    expect(cardGridCategories([{}, { name: 'A' }, { category: 'Shoes' }])).toEqual([
      { key: 'shoes', label: 'Shoes' },
    ])
  })

  it.each([null, undefined, {}, 'x', 42])('returns an empty list for %s', (items) => {
    expect(cardGridCategories(items)).toEqual([])
  })
})

describe('isFilterCardGrid — one predicate for markup, emission and no-script', () => {
  it.each([
    ['two distinct categories and the filter display', filterGrid, true],
    ['one distinct category', oneCategoryGrid, false],
    [
      'a whitespace-only second category',
      { type: 'card-grid', props: { display: 'filter', items: [{ category: 'Shoes' }, { category: '  ' }] } },
      false,
    ],
    [
      'a capitalised display value',
      { type: 'card-grid', props: { display: 'Filter', items: [{ category: 'a' }, { category: 'b' }] } },
      false,
    ],
    [
      'a display value with leading space',
      { type: 'card-grid', props: { display: ' filter', items: [{ category: 'a' }, { category: 'b' }] } },
      false,
    ],
    [
      'a numeric display value',
      { type: 'card-grid', props: { display: 1, items: [{ category: 'a' }, { category: 'b' }] } },
      false,
    ],
    ['an absent display value', plainGrid, false],
    [
      'a different block type',
      { type: 'gallery', props: { display: 'filter', items: [{ category: 'a' }, { category: 'b' }] } },
      false,
    ],
    [
      'a capitalised block type',
      { type: 'Card-grid', props: { display: 'filter', items: [{ category: 'a' }, { category: 'b' }] } },
      false,
    ],
  ])('returns the right verdict for %s', (_label, block, expected) => {
    expect(isFilterCardGrid(block)).toBe(expected)
  })

  it.each([null, undefined, 0, '', 'card-grid', [], true])('never throws on %s', (value) => {
    expect(() => isFilterCardGrid(value)).not.toThrow()
    expect(isFilterCardGrid(value)).toBe(false)
  })
})

describe('emission — the filter grid is the fourth condition', () => {
  it('emits the runtime for a filter grid', () => {
    expect(needsBehaviorRuntime([filterGrid])).toBe(true)
  })

  it('does not emit for a plain grid', () => {
    expect(needsBehaviorRuntime([plainGrid])).toBe(false)
  })

  it('does not emit for a filter grid with one distinct category', () => {
    expect(needsBehaviorRuntime([oneCategoryGrid])).toBe(false)
  })

  it('still emits for a page that already carried the runtime', () => {
    expect(needsBehaviorRuntime([navbar, plainGrid])).toBe(true)
  })
})

describe('no-script rules — the filter group is appended last', () => {
  it('emits only the filter rule for a filter grid', () => {
    expect(renderBehaviorNoscript([filterGrid])).toBe(
      '\n  <noscript><style>' + FILTER_NOSCRIPT_CSS + '</style></noscript>',
    )
  })

  it('appends the filter group after menu, tabs and carousel', () => {
    const html = renderBehaviorNoscript([navbar, tabSet, carousel, filterGrid])
    expect(html).toContain(
      [BEHAVIOR_NOSCRIPT_CSS, TABS_NOSCRIPT_CSS, CAROUSEL_NOSCRIPT_CSS, FILTER_NOSCRIPT_CSS].join('\n'),
    )
  })

  it('hides the filter buttons when scripts are off', () => {
    expect(FILTER_NOSCRIPT_CSS).toBe('[data-sb-filter-btn]{display:none!important}')
  })

  it('emits nothing for a plain grid', () => {
    expect(renderBehaviorNoscript([plainGrid])).toBe('')
  })
})

describe('delegated handler behavior', () => {
  const markup = [
    '<div data-sb-filter id="grid-shared">',
    '<div class="row">',
    '<button id="a-all" data-sb-filter-btn="" aria-pressed="true">All</button>',
    '<button id="a-shoes-btn" data-sb-filter-btn="shoes" aria-pressed="false">Shoes</button>',
    '<button id="a-bags-btn" data-sb-filter-btn="bags" aria-pressed="false">Bags</button>',
    '</div>',
    '<div class="grid">',
    '<div id="a-shoes" data-sb-category="shoes">Shoe</div>',
    '<div id="a-bags" data-sb-category="bags">Bag</div>',
    '<div id="a-uncat" data-sb-category="">Other</div>',
    '</div>',
    '</div>',
    // A second grid on the same page, deliberately sharing the wrapper id: the
    // runtime never looks an id up, so the two must stay independent.
    '<div data-sb-filter id="grid-shared">',
    '<button id="b-shoes-btn" data-sb-filter-btn="shoes" aria-pressed="false">Shoes</button>',
    '<div id="b-shoes" data-sb-category="shoes">Shoe</div>',
    '</div>',
    '<div id="outside"><button id="loner" data-sb-filter-btn="shoes">Loner</button></div>',
  ].join('')

  const byId = (id: string): HTMLElement => document.getElementById(id) as HTMLElement
  const scopes = (): Element[] => Array.from(document.querySelectorAll('[data-sb-filter]'))
  const pressedIn = (scope: Element): string[] =>
    Array.from(scope.querySelectorAll('[data-sb-filter-btn]'))
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.id)
  const click = (el: Element): void => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  }
  const press = (el: Element, key: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    el.dispatchEvent(event)
    return event
  }
  const allCards = (): HTMLElement[] => ['a-shoes', 'a-bags', 'a-uncat'].map(byId)

  beforeAll(() => {
    // Evaluated once: the runtime installs delegated document listeners and
    // performs no per-page initialization work.
    new Function(BEHAVIOR_RUNTIME_SOURCE)()
  })

  beforeEach(() => {
    document.body.innerHTML = markup
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows only the clicked category and marks one button pressed', () => {
    click(byId('a-shoes-btn'))
    expect(byId('a-shoes').hidden).toBe(false)
    expect(byId('a-bags').hidden).toBe(true)
    expect(byId('a-uncat').hidden).toBe(true)
    expect(pressedIn(scopes()[0])).toEqual(['a-shoes-btn'])
  })

  it('restores every card, uncategorised included, when All is activated', () => {
    click(byId('a-shoes-btn'))
    click(byId('a-all'))
    expect(allCards().map((card) => card.hidden)).toEqual([false, false, false])
    expect(pressedIn(scopes()[0])).toEqual(['a-all'])
  })

  it('activates a button with the Enter key and prevents the default', () => {
    const event = press(byId('a-bags-btn'), 'Enter')
    expect(byId('a-bags').hidden).toBe(false)
    expect(byId('a-shoes').hidden).toBe(true)
    expect(pressedIn(scopes()[0])).toEqual(['a-bags-btn'])
    expect(event.defaultPrevented).toBe(true)
  })

  it('activates a button with the Space key and prevents the default', () => {
    const event = press(byId('a-bags-btn'), ' ')
    expect(byId('a-bags').hidden).toBe(false)
    expect(byId('a-shoes').hidden).toBe(true)
    expect(event.defaultPrevented).toBe(true)
  })

  it('ignores an unrelated key press', () => {
    const event = press(byId('a-shoes-btn'), 'a')
    expect(byId('a-shoes').hidden).toBe(false)
    expect(byId('a-bags').hidden).toBe(false)
    expect(pressedIn(scopes()[0])).toEqual(['a-all'])
    expect(event.defaultPrevented).toBe(false)
  })

  it('keeps two grids independent even when they share a wrapper id', () => {
    click(byId('b-shoes-btn'))
    expect(byId('b-shoes').hidden).toBe(false)
    expect(pressedIn(scopes()[1])).toEqual(['b-shoes-btn'])
    // The first grid must be untouched by a click in the second.
    expect(allCards().map((card) => card.hidden)).toEqual([false, false, false])
    expect(pressedIn(scopes()[0])).toEqual(['a-all'])
  })

  it('ignores a button that sits outside any filter scope', () => {
    // Enter and Space reach preventDefault only after the scope guard, so the
    // event flag is what actually observes a removed guard (a throw inside a
    // delegated listener never escapes dispatchEvent).
    const enter = press(byId('loner'), 'Enter')
    const space = press(byId('loner'), ' ')
    expect(() => click(byId('loner'))).not.toThrow()
    expect(enter.defaultPrevented).toBe(false)
    expect(space.defaultPrevented).toBe(false)
    expect(byId('loner').getAttribute('aria-pressed')).toBeNull()
    expect(allCards().map((card) => card.hidden)).toEqual([false, false, false])
  })
})

describe('source integrity — one contiguous insertion before the closing line', () => {
  const frozen = JSON.parse(
    readFileSync(resolve(import.meta.dirname, 'fixtures/export-baseline-0.6.0/runtime-segments.json'), 'utf8'),
  ) as string[]
  const current = BEHAVIOR_RUNTIME_SOURCE.split('\n')
  const check = checkRuntimeSegments(frozen, current)
  const insertedSource = check.inserted.map((index) => current[index]).join('\n')
  const gzip = (text: string): number => gzipSync(Buffer.from(text, 'utf8')).length

  it('keeps every released segment and adds one contiguous run', () => {
    expect(check.missing).toEqual([])
    expect(check.inserted.length).toBeGreaterThan(0)
    expect(check.oneRun).toBe(true)
    expect(check.beforeLast).toBe(true)
    expect(current[current.length - 1]).toBe('})(document,window);')
  })

  it('places the filter hooks in the inserted run', () => {
    expect(insertedSource).toContain('data-sb-filter-btn')
    expect(insertedSource).toContain('data-sb-filter')
    expect(insertedSource).toContain('data-sb-category')
  })

  it('introduces no unsafe API and stays free of case-folding and class toggles', () => {
    for (const token of [
      'innerHTML',
      'outerHTML',
      'insertAdjacentHTML',
      'document.write',
      'eval(',
      'Function(',
      'setTimeout',
      'setInterval',
      'toLowerCase',
      'classList',
    ]) {
      expect(insertedSource).not.toContain(token)
    }
  })

  it('adds at most the phase budget gzipped to the released script', () => {
    const delta = gzip(BEHAVIOR_RUNTIME_SOURCE) - gzip(frozen.join('\n'))
    expect(delta).toBeGreaterThan(0)
    // 499 is the binding budget: the locked 2048 cumulative ceiling minus the
    // measured 1549 baseline.
    expect(delta).toBeLessThanOrEqual(499)
  })

  it('stays under the tighter cumulative ceiling and the hard cap', () => {
    const total = gzip(BEHAVIOR_RUNTIME_SOURCE)
    expect(total).toBeLessThanOrEqual(2048)
    // The 5120 hard cap is also asserted by the shipped runtime suite.
    expect(total).toBeLessThanOrEqual(5120)
  })
})
