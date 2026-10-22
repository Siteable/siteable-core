/**
 * Filter cases and observation for the shared behavior table.
 *
 * Category filtering exists only on a published page: the editor canvas always
 * shows every card and renders no filter control. Every row here therefore
 * carries `exportOnly: true`, so the editor run and the parity loops replay
 * `EDITOR_CASES` (which drops them) while the export run keeps the full list.
 *
 * Observation reads the export hooks (`data-sb-filter`, `data-sb-filter-btn`,
 * `data-sb-category`) inside each scope, so two grids on one page are observed
 * independently and a click in one cannot be mistaken for a change in the other.
 */
import type { BehaviorAdapter, BehaviorCase, ExpectedView } from './behavior-test-table'
import { panelHasTransition } from './behavior-test-table-tabs'

/** One filter grid, observed in document order. */
export interface FilterView {
  /** `aria-pressed` per button: "All" first, then one per category. */
  pressed: boolean[]
  /** Per card: the `hidden` attribute is not set. */
  visible: boolean[]
  /** Every button is enabled and in the keyboard tab order. */
  focusable: boolean
  /** No card carries a display utility or a transition that would outrank `hidden`. */
  noStyleTrap: boolean
}

export type FilterStep =
  | { kind: 'clickFilter'; grid: number; button: number }
  | { kind: 'focusFilter'; grid: number; button: number }

/** Tailwind display utilities that would beat the `hidden` attribute. */
const DISPLAY_TOKENS = ['block', 'flex', 'grid', 'inline', 'inline-block', 'inline-flex', 'hidden']
/** The variant suffix counts: `@md:flex` beats `hidden` just like `flex` does. */
export const isDisplayToken = (token: string): boolean =>
  DISPLAY_TOKENS.includes(token.split(':').pop() ?? '')

export function filterScopes(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-sb-filter]'))
}

export function filterButtonsIn(scope: Element): HTMLButtonElement[] {
  return Array.from(scope.querySelectorAll<HTMLButtonElement>('[data-sb-filter-btn]'))
}

export function filterCardsIn(scope: Element): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>('[data-sb-category]'))
}

function filterView(scope: Element): FilterView {
  const buttons = filterButtonsIn(scope)
  const cards = filterCardsIn(scope)
  return {
    pressed: buttons.map((button) => button.getAttribute('aria-pressed') === 'true'),
    visible: cards.map((card) => !card.hidden),
    focusable:
      buttons.length > 0 && buttons.every((button) => !button.disabled && button.tabIndex >= 0),
    noStyleTrap: cards.every(
      (card) =>
        card.style.display === '' &&
        !panelHasTransition(card) &&
        !Array.from(card.classList).some((token) => isDisplayToken(token)),
    ),
  }
}

/** Observe only the filter fields the case expects. */
export function observeFilters(expected: ExpectedView): Record<string, unknown> {
  const view: Record<string, unknown> = {}
  const scopes = filterScopes()
  if (expected.filters) view.filters = scopes.map(filterView)
  if (expected.filterLabels) {
    view.filterLabels = scopes.map((scope) =>
      filterButtonsIn(scope).map((button) => (button.textContent ?? '').trim()),
    )
  }
  return view
}

/** Drive one filter step; a missing grid or button fails loudly rather than skipping. */
export function applyFilterStep(adapter: BehaviorAdapter, step: FilterStep): void {
  const scope = filterScopes()[step.grid]
  if (!scope) throw new Error(`no filter grid at index ${step.grid}`)
  const button = filterButtonsIn(scope)[step.button]
  if (!button) throw new Error(`no filter button at index ${step.button} in grid ${step.grid}`)
  if (step.kind === 'clickFilter') {
    adapter.click(button)
    return
  }
  button.focus()
  if (document.activeElement !== button) throw new Error('filter button did not receive focus')
}

/** A filter grid with `buttons` buttons, `active` pressed, and per-card visibility. */
const filterState = (buttons: number, active: number, visible: boolean[]): FilterView => ({
  pressed: Array.from({ length: buttons }, (_, index) => index === active),
  visible,
  focusable: true,
  noStyleTrap: true,
})

const clickFilter = (grid: number, button: number): FilterStep => ({ kind: 'clickFilter', grid, button })
const focusFilter = (grid: number, button: number): FilterStep => ({ kind: 'focusFilter', grid, button })
const key = (value: string) => ({ kind: 'key' as const, key: value })

export const FILTER_CASES: BehaviorCase[] = [
  // G1: the default state shows every card with "All" pressed.
  { id: 'G1', behavior: 'filter', fixture: 'card-grid-filter', steps: [],
    expect: { filters: [filterState(4, 0, [true, true, true, true, true])],
      filterLabels: [['All', 'Shoes', 'Hats', 'Bags']] }, exportOnly: true },
  // G2: a category hides the other cards, the uncategorised one included.
  { id: 'G2', behavior: 'filter', fixture: 'card-grid-filter', steps: [clickFilter(0, 1)],
    expect: { filters: [filterState(4, 1, [true, true, false, false, false])] }, exportOnly: true },
  // G3: "All" restores every card, uncategorised included, by rule.
  { id: 'G3', behavior: 'filter', fixture: 'card-grid-filter', steps: [clickFilter(0, 1), clickFilter(0, 0)],
    expect: { filters: [filterState(4, 0, [true, true, true, true, true])] }, exportOnly: true },
  // G4: Enter on a focused button applies the same filter.
  { id: 'G4', behavior: 'filter', fixture: 'card-grid-filter', steps: [focusFilter(0, 2), key('Enter')],
    expect: { filters: [filterState(4, 2, [false, false, true, false, false])] }, exportOnly: true },
  // G5: Space on a focused button applies the same filter.
  { id: 'G5', behavior: 'filter', fixture: 'card-grid-filter', steps: [focusFilter(0, 3), key(' ')],
    expect: { filters: [filterState(4, 3, [false, false, false, true, false])] }, exportOnly: true },
  // G6: exactly one button is pressed at a time.
  { id: 'G6', behavior: 'filter', fixture: 'card-grid-filter', steps: [clickFilter(0, 1), clickFilter(0, 2)],
    expect: { filters: [filterState(4, 2, [false, false, true, false, false])] }, exportOnly: true },
  // G7: two grids on one page stay independent.
  { id: 'G7', behavior: 'filter', fixture: 'two-card-grids', steps: [clickFilter(0, 1)],
    expect: { filters: [filterState(3, 1, [true, true, false]), filterState(3, 0, [true, true, true])] }, exportOnly: true },
  // G8: two blocks sharing one id stay independent.
  { id: 'G8', behavior: 'filter', fixture: 'card-grids-shared-id', steps: [clickFilter(0, 1)],
    expect: { filters: [filterState(3, 1, [true, true, false]), filterState(3, 0, [true, true, true])] }, exportOnly: true },
  // G9: spellings differing only by case or spacing merge into one category.
  { id: 'G9', behavior: 'filter', fixture: 'card-grid-case-merge', steps: [clickFilter(0, 1)],
    expect: { filters: [filterState(3, 1, [true, true, true, false])],
      filterLabels: [['All', 'Shoes', 'Hats']] }, exportOnly: true },
  // G10: a button stays focusable and activates from the keyboard AFTER a
  // filter is applied (a display utility would hide the card, not the button).
  { id: 'G10', behavior: 'filter', fixture: 'card-grid-filter', steps: [clickFilter(0, 1), focusFilter(0, 2), key('Enter')],
    expect: { filters: [filterState(4, 2, [false, false, true, false, false])] }, exportOnly: true },
]
