/**
 * Tabs behavior in the shared runtime.
 *
 * The tabs widget rides the one exported behavior runtime, so these tests pin
 * the three contracts the exporter and the editor depend on: what counts as a
 * rendered tab set for the emission predicate (so "rendered as tabs" and "gets
 * the script" cannot drift), the no-script stylesheet composed per block list
 * (the no-argument call still emits the exact 0.4.0 bytes the frozen baselines
 * were captured with), and the source executed for real — select on click,
 * wrap both ends, Home/End, unrelated keys ignored, focus follows selection,
 * a roving tab stop, and one tab set never disturbing another.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { gzipSync } from 'node:zlib'
import {
  BEHAVIOR_NOSCRIPT_CSS,
  BEHAVIOR_RUNTIME_SOURCE,
  TAB_ID_PREFIX,
  isFeaturesTabSet,
  needsBehaviorRuntime,
  renderBehaviorNoscript,
} from '../src/lib/export-behavior-runtime'

/** Gzip ceiling for the menu + faq + tabs budget. */
const GZIP_CAP_BYTES = 2048

/** The exact no-script wrapper 0.4.0 emitted; pinned, not derived. */
const NOSCRIPT_0_4_0 =
  '\n  <noscript><style>' +
  '[data-sb-menu-toggle]{display:none!important}\n' +
  '@media (max-width:1023.98px){[data-sb-menu-panel]{display:block!important}}\n' +
  '.faq-content{max-height:none!important;padding-bottom:1rem!important}\n' +
  '.faq-chevron{display:none!important}' +
  '</style></noscript>'

const tabSet = (items: unknown, display: unknown = 'tabs'): unknown => ({
  type: 'features',
  props: { display, items },
})
const features = (props: unknown): unknown => ({ type: 'features', props })
const tabsPage = (extra: unknown[] = []): unknown[] => [tabSet([{}, {}]), ...extra]

describe('isFeaturesTabSet — what counts as a rendered tab set', () => {
  it.each([
    ['two items', tabSet([{ title: 'A' }, { title: 'B' }]), true],
    ['three items', tabSet([{}, {}, {}]), true],
    ['one item', tabSet([{ title: 'A' }]), false],
    ['no items', tabSet([]), false],
    ['items is a string', tabSet('tabs'), false],
    ['items is an object', tabSet({ 0: {}, 1: {} }), false],
    ['items missing', features({ display: 'tabs' }), false],
    ['props missing', { type: 'features' }, false],
    ['props null', features(null), false],
    ['props is an array', { type: 'features', props: ['tabs'] }, false],
    ['display flattened beside type', { type: 'features', display: 'tabs', items: [{}, {}] }, false],
    ['another block type', { type: 'hero', props: { display: 'tabs', items: [{}, {}] } }, false],
    ['a non-object', 'features', false],
    ['null', null, false],
    ['undefined', undefined, false],
  ])('%s -> %s', (_label, block, expected) => expect(isFeaturesTabSet(block)).toBe(expected))

  it('requires the exact display string, whatever else it is handed', () => {
    for (const display of ['TABS', ' tabs', 'tabs ', 'tab', 'grid', '', 1, true, {}, ['tabs'], null]) {
      expect(isFeaturesTabSet(tabSet([{}, {}], display))).toBe(false)
    }
  })
})

describe('needsBehaviorRuntime — tab sets join the predicate', () => {
  it.each([
    ['a rendered tab set', tabsPage(), true],
    ['a tab set beside non-objects', [null, undefined, 42, 'features', [], ...tabsPage()], true],
    ['a tab set beside a navbar', tabsPage([{ type: 'navbar' }]), true],
    ['a one-item features block', [tabSet([{}])], false],
    ['a features block without tabs display', [tabSet([{}, {}], 'grid')], false],
    ['a page of other blocks', [{ type: 'hero' }, { type: 'footer' }], false],
  ])('%s', (_label, blocks, expected) => expect(needsBehaviorRuntime(blocks)).toBe(expected))

  it('tolerates a non-array value unchanged', () => {
    expect(needsBehaviorRuntime(tabSet([{}, {}]))).toBe(false)
    expect(needsBehaviorRuntime(undefined)).toBe(false)
  })
})

describe('renderBehaviorNoscript — composed per block list', () => {
  it('emits the menu/faq rules for a page with a navbar', () => {
    expect(renderBehaviorNoscript([{ type: 'navbar' }])).toBe(NOSCRIPT_0_4_0)
  })

  it('emits only the tab rules for a page with a tab set', () => {
    const html = renderBehaviorNoscript(tabsPage())
    expect(html).toContain('<noscript><style>')
    expect(html).toContain('[data-sb-tablist]{display:none!important}')
    expect(html).toContain('[data-sb-tab-panel],[data-sb-tab-title]{display:block!important}')
    expect(html).not.toContain(BEHAVIOR_NOSCRIPT_CSS)
  })

  it('emits both rule sets, menu/faq first, for a page carrying both widgets', () => {
    const html = renderBehaviorNoscript(tabsPage([{ type: 'navbar' }]))
    expect(html).toContain(BEHAVIOR_NOSCRIPT_CSS)
    expect(html.indexOf('[data-sb-tablist]')).toBeGreaterThan(html.indexOf('[data-sb-menu-toggle]'))
  })

  it('emits nothing for a page with neither widget', () => {
    expect(renderBehaviorNoscript([{ type: 'hero' }])).toBe('')
    expect(renderBehaviorNoscript([])).toBe('')
    expect(renderBehaviorNoscript(undefined)).toBe(NOSCRIPT_0_4_0)
  })

  it('marks every tab declaration important so it wins over utility classes', () => {
    const html = renderBehaviorNoscript(tabsPage())
    const rules = (html.match(/[^{}]+\{[^{}]*\}/g) ?? []).filter((rule) => rule.includes('sb-tab'))
    expect(rules.length).toBeGreaterThanOrEqual(2)
    for (const rule of rules) {
      for (const declaration of rule.slice(rule.indexOf('{') + 1, rule.lastIndexOf('}')).split(';')) {
        if (declaration.trim()) expect(declaration).toContain('!important')
      }
    }
  })
})

describe('BEHAVIOR_RUNTIME_SOURCE — tab budget', () => {
  it('keeps the menu + faq + tabs source within the gzip ceiling', () => {
    expect(gzipSync(Buffer.from(BEHAVIOR_RUNTIME_SOURCE, 'utf8')).length).toBeLessThanOrEqual(GZIP_CAP_BYTES)
  })

  it('pins the panel id prefix the exporter markup must build ids from', () => {
    // The `_` is what no block id can contain, so `sb_tabs_<blockId>_<n>`
    // cannot collide with a generated block id. The half of that claim which
    // depends on the id GENERATOR lives with the generator —
    // asserting it here would only re-state the literal.
    expect(TAB_ID_PREFIX).toBe('sb_tabs_')
  })
})

describe('runtime source behavior — tabs', () => {
  // The second set starts on its last tab so cross-talk between sets shows up
  // as a change instead of matching the default markup. The third set has three
  // tabs: with only two, "wrap from the last" and "stay put" produce the same
  // index, so a broken forward move would pass every two-tab assertion.
  const set = (id: string, labels: string[], selectedIndex = 0): string => {
    const tab = (i: number) =>
      `<button type="button" role="tab" data-sb-tab id="sb_tabs_${id}_${i}" ` +
      `aria-controls="sb_tabs_${id}_panel_${i}" aria-selected="${i === selectedIndex}" ` +
      `tabindex="${i === selectedIndex ? '0' : '-1'}">${labels[i]}</button>`
    const panel = (i: number) =>
      `<div role="tabpanel" data-sb-tab-panel id="sb_tabs_${id}_panel_${i}" ` +
      `aria-labelledby="sb_tabs_${id}_${i}" tabindex="0"${i === selectedIndex ? '' : ' hidden'}>Panel ${i}</div>`
    const rows = labels.map((_l, i) => i)
    return `<div role="tablist" data-sb-tablist id="${id}">${rows.map(tab).join('')}</div>` +
      rows.map(panel).join('')
  }

  const markup = [
    set('one', ['A', 'B']),
    set('two', ['C', 'D'], 1),
    set('three', ['E', 'F', 'G']),
    '<p id="plain">Not a tab</p>',
    '<input id="field" type="text" />',
  ].join('')

  const byId = (id: string): HTMLElement => document.getElementById(id) as HTMLElement
  const tabsIn = (listId: string): HTMLElement[] =>
    Array.from(byId(listId).querySelectorAll('[data-sb-tab]')) as HTMLElement[]
  const panelOf = (tab: HTMLElement): HTMLElement => byId(tab.getAttribute('aria-controls') as string)
  const press = (target: Element, key: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    target.dispatchEvent(event)
    return event
  }
  const selected = (listId: string): string =>
    tabsIn(listId)
      .map((tab) => tab.getAttribute('aria-selected'))
      .join(',')

  beforeAll(() => {
    // Evaluated once for the whole file: the runtime installs delegated
    // document listeners and performs no per-page initialization work.
    new Function(BEHAVIOR_RUNTIME_SOURCE)()
  })

  beforeEach(() => {
    document.body.innerHTML = markup
  })

  it('selects a tab on click and reveals only its panel', () => {
    byId('sb_tabs_one_1').click()
    expect(selected('one')).toBe('false,true')
    expect(panelOf(byId('sb_tabs_one_1')).hidden).toBe(false)
    expect(panelOf(byId('sb_tabs_one_0')).hidden).toBe(true)
  })

  it('moves the roving tab stop to the selected tab only', () => {
    byId('sb_tabs_one_1').click()
    const [first, second] = tabsIn('one')
    expect(second.getAttribute('tabindex')).toBe('0')
    expect(second.tabIndex).toBe(0)
    expect(first.getAttribute('tabindex')).toBe('-1')
    expect(first.tabIndex).toBe(-1)
  })

  // Driven from the second set, whose markup starts on its last tab, so the
  // expectation differs from the initial state without needing a prior click.
  it('wraps ArrowRight from the last tab to the first', () => {
    press(byId('sb_tabs_two_1'), 'ArrowRight')
    expect(selected('two')).toBe('true,false')
    expect(byId('sb_tabs_two_panel_0').hidden).toBe(false)
    expect(byId('sb_tabs_two_panel_1').hidden).toBe(true)
  })

  // Driven from a three-tab set: a forward move is a real index change here,
  // where on a two-tab set it would land on the same tab as every broken
  // variant of the wrap arithmetic.
  it('moves ArrowRight forward one tab, and ArrowLeft back, inside the set', () => {
    press(byId('sb_tabs_three_0'), 'ArrowRight')
    expect(selected('three')).toBe('false,true,false')
    expect(byId('sb_tabs_three_panel_1').hidden).toBe(false)
    press(byId('sb_tabs_three_1'), 'ArrowRight')
    expect(selected('three')).toBe('false,false,true')
    press(byId('sb_tabs_three_2'), 'ArrowLeft')
    expect(selected('three')).toBe('false,true,false')
    expect(byId('sb_tabs_three_panel_2').hidden).toBe(true)
  })

  it('wraps ArrowLeft from the first tab to the last', () => {
    byId('sb_tabs_one_0').click()
    press(byId('sb_tabs_one_0'), 'ArrowLeft')
    expect(selected('one')).toBe('false,true')
  })

  it('jumps to the first tab on Home and the last on End', () => {
    byId('sb_tabs_one_1').click()
    press(byId('sb_tabs_one_1'), 'Home')
    expect(selected('one')).toBe('true,false')
    press(byId('sb_tabs_one_0'), 'End')
    expect(selected('one')).toBe('false,true')
  })

  it('moves focus to the newly selected tab (selection follows focus)', () => {
    byId('sb_tabs_one_0').click()
    press(byId('sb_tabs_one_0'), 'End')
    expect(document.activeElement).toBe(byId('sb_tabs_one_1'))
  })

  it('does not steal focus on a click, only on a key that moves the selection', () => {
    // The click path passes move=false. A redundant focus() there would be
    // harmless in a browser (the button is focused natively) but it is the
    // difference between "selection follows focus" and "click also moves
    // focus", so the false branch is pinned rather than left incidental.
    const field = byId('field')
    field.focus()
    expect(document.activeElement).toBe(field)
    byId('sb_tabs_one_1').click()
    expect(selected('one')).toBe('false,true')
    expect(document.activeElement).toBe(field)
  })

  it('ignores a key it does not handle and does not suppress it', () => {
    byId('sb_tabs_one_1').click()
    for (const key of ['ArrowDown', 'PageUp', 'a', 'Escape', 'Tab']) {
      expect(press(byId('sb_tabs_one_1'), key).defaultPrevented).toBe(false)
    }
    expect(selected('one')).toBe('false,true')
  })

  it('suppresses the default of a key it handles', () => {
    expect(press(byId('sb_tabs_one_0'), 'ArrowRight').defaultPrevented).toBe(true)
  })

  it('resolves a click on a child of a tab to the owning tab', () => {
    byId('sb_tabs_one_1').innerHTML = '<span id="label">B</span>'
    byId('label').click()
    expect(selected('one')).toBe('false,true')
  })

  it('leaves the other tab set untouched', () => {
    // Put the first set into a state its markup does not start in, so "not
    // disturbed by the other set" cannot be confused with "never acted on".
    byId('sb_tabs_one_1').click()
    expect(selected('one')).toBe('false,true')
    press(byId('sb_tabs_two_1'), 'Home')
    expect(selected('two')).toBe('true,false')
    expect(selected('one')).toBe('false,true')
    expect(byId('sb_tabs_two_panel_0').hidden).toBe(false)
    expect(byId('sb_tabs_one_panel_1').hidden).toBe(false)
    expect(byId('sb_tabs_one_panel_0').hidden).toBe(true)
  })

  it('still updates the tab state when a tab names a panel that is not there', () => {
    // Malformed markup must not throw out of a document-level listener: the
    // selector state is written before the panel is resolved, so the tab set
    // stays coherent even when its panel reference is dangling. The throw is
    // caught on `window` because a listener that throws does NOT propagate out
    // of dispatchEvent — asserting only "did not throw" would pass regardless.
    const tab = byId('sb_tabs_one_1')
    tab.setAttribute('aria-controls', 'no-such-panel')
    const errors: unknown[] = []
    const onError = (event: ErrorEvent) => {
      errors.push(event.error ?? event.message)
      event.preventDefault()
    }
    window.addEventListener('error', onError)
    tab.click()
    window.removeEventListener('error', onError)

    expect(errors).toEqual([])
    expect(selected('one')).toBe('false,true')
    expect(tab.getAttribute('tabindex')).toBe('0')
  })

  it('does not throw on a tab that sits outside any tab list', () => {
    // (i+1)%n with n === 0 is NaN, and NaN < 0 is false — the "unhandled key"
    // early-out does not catch it, so the guard is load-bearing, not defensive.
    // The error is captured on `window`, NOT asserted with `.not.toThrow()`: a
    // throw inside a listener does not propagate out of dispatchEvent, so that
    // form passes even when the guard is replaced by an unconditional throw.
    document.body.innerHTML +=
      '<button type="button" data-sb-tab id="orphan">Orphan</button>'
    const errors: unknown[] = []
    const onError = (event: ErrorEvent) => {
      errors.push(event.error ?? event.message)
      event.preventDefault()
    }
    window.addEventListener('error', onError)
    const event = press(byId('orphan'), 'ArrowRight')
    window.removeEventListener('error', onError)

    expect(errors).toEqual([])
    expect(event.defaultPrevented).toBe(false)
  })

  it('changes nothing when the click lands outside any tab', () => {
    byId('sb_tabs_one_1').click()
    byId('plain').click()
    byId('field').click()
    expect(selected('one')).toBe('false,true')
    expect(byId('sb_tabs_one_panel_1').hidden).toBe(false)
    expect(byId('sb_tabs_one_panel_0').hidden).toBe(true)
  })

  it('ignores a keydown that did not originate in a tab', () => {
    byId('sb_tabs_one_1').click()
    expect(press(byId('plain'), 'ArrowRight').defaultPrevented).toBe(false)
    expect(selected('one')).toBe('false,true')
  })
})
