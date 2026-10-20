/**
 * One behavior table, two environments.
 *
 * Menu and faq interactions are described in this module as `BEHAVIOR_CASES`;
 * the tab rows live beside their own observation helpers in
 * `behavior-test-table-tabs.ts` and are appended to the same array. Then the
 * rows are replayed against an adapter that mounts and drives one environment
 * (an exported page in a DOM document, or the React editor preview). Nothing here
 * knows which one it is running in: expected values are identical for both, so
 * a divergence fails one of the two runs. Later behaviors append a case — and,
 * where needed, a fixture.
 *
 * Fixtures live in `behavior-fixtures.ts`; the cases are replayed through
 * `runCase`, which the cross-environment parity runner reuses so a row cannot
 * be interpreted two different ways.
 */
import { it, expect } from 'vitest'
import { FIXTURE_BLOCKS, type Fixture } from './behavior-fixtures'
import {
  TAB_CASES,
  applyTabStep,
  observeTabs,
  panelHasTransition,
  type TabSetView,
  type TabStep,
} from './behavior-test-table-tabs'

export { FIXTURE_BLOCKS }
export type { Fixture }

export interface BehaviorAdapter {
  /** Reset the environment and render the fixture's blocks. */
  mount(fixture: Fixture): void
  menuButtons(): HTMLButtonElement[]
  faqButtons(): HTMLButtonElement[]
  /** Activate an element, flushing framework updates before returning. */
  click(el: Element): void
  /** Dispatch a keyboard event on an element (it must bubble). */
  key(el: Element, key: string): void
  setReducedMotion(on: boolean): void
}

export type Step =
  | { kind: 'click'; target: 'menu' | 'faq'; index: number }
  | { kind: 'focusFirstPanelLink'; menu: number }
  | { kind: 'key'; key: string }
  | { kind: 'reducedMotion'; on: boolean }
  | TabStep

/** What one menu button and the panel it controls must look like. */
export interface MenuView {
  /** Raw observations, kept apart so a stale attribute cannot read as closed. */
  expanded: boolean
  hidden: boolean
  open: boolean
  /** `aria-controls` names an element that exists in the document. */
  reference: boolean
  /** The button carries a non-empty accessible label. */
  label: boolean
  /** The panel carries no transition/animation class and no inline transition. */
  noTransition: boolean
}

export interface ExpectedView {
  menus?: MenuView[]
  /** Index of the menu button that owns focus; omit when focus is irrelevant. */
  focusMenu?: number
  /** Panel ids are unique and every one resolves. */
  distinctPanels?: boolean
  /** Expanded state per faq button, in document order. */
  faq?: boolean[]
  /** One view per tab set, in document order. */
  tabs?: TabSetView[]
  /** Focused tab as [set index, tab index]; null when no tab owns focus. */
  focusTab?: [number, number] | null
  /** Label text per tab, per set. */
  labels?: string[][]
  /** Description text per tab's panel, per set. */
  descriptions?: string[][]
}

export interface BehaviorCase {
  id: string
  behavior: 'menu' | 'faq' | 'tabs'
  fixture: Fixture
  steps: Step[]
  expect: ExpectedView
}

const menuState = (open: boolean): MenuView => ({ expanded: open, hidden: !open, open, reference: true, label: true, noTransition: true })
const clickMenu = (index: number): Step => ({ kind: 'click', target: 'menu', index })
const clickFaq = (index: number): Step => ({ kind: 'click', target: 'faq', index })

export const BEHAVIOR_CASES: BehaviorCase[] = [
  { id: 'M1', behavior: 'menu', fixture: 'navbar', steps: [], expect: { menus: [menuState(false)] } },
  { id: 'M2', behavior: 'menu', fixture: 'navbar', steps: [clickMenu(0)], expect: { menus: [menuState(true)] } },
  { id: 'M3', behavior: 'menu', fixture: 'navbar', steps: [clickMenu(0), clickMenu(0)], expect: { menus: [menuState(false)] } },
  { id: 'M4', behavior: 'menu', fixture: 'navbar', steps: [clickMenu(0), { kind: 'focusFirstPanelLink', menu: 0 }, { kind: 'key', key: 'Escape' }], expect: { menus: [menuState(false)], focusMenu: 0 } },
  { id: 'M5', behavior: 'menu', fixture: 'two-navbars', steps: [clickMenu(0), clickMenu(1), clickMenu(1)], expect: { menus: [menuState(true), menuState(false)], distinctPanels: true } },
  // State-only row: reduced motion changes no menu semantics; mechanism proof is env-specific (export inline `transition:none`, editor `motion-reduce:transition-none`).
  { id: 'M6', behavior: 'menu', fixture: 'navbar', steps: [{ kind: 'reducedMotion', on: true }, clickMenu(0)], expect: { menus: [menuState(true)] } },
  { id: 'M7', behavior: 'menu', fixture: 'two-navbars', steps: [clickMenu(0), clickMenu(1), { kind: 'focusFirstPanelLink', menu: 0 }, { kind: 'key', key: 'Escape' }], expect: { menus: [menuState(false), menuState(true)], focusMenu: 0 } },
  { id: 'F1', behavior: 'faq', fixture: 'faq', steps: [], expect: { faq: [true, false, false] } },
  { id: 'F2', behavior: 'faq', fixture: 'faq', steps: [clickFaq(1)], expect: { faq: [false, true, false] } },
  { id: 'F3', behavior: 'faq', fixture: 'faq', steps: [clickFaq(0)], expect: { faq: [false, false, false] } },
  { id: 'F4', behavior: 'faq', fixture: 'faq', steps: [clickFaq(2), clickFaq(2)], expect: { faq: [false, false, false] } },
  ...TAB_CASES,
]

/** Panel element named by a button's `aria-controls`, when it exists. */
export function controlledPanel(button: HTMLButtonElement): HTMLElement | null {
  return document.getElementById(button.getAttribute('aria-controls') ?? '')
}

export function isMenuOpen(button: HTMLButtonElement): boolean {
  const panel = controlledPanel(button)
  return button.getAttribute('aria-expanded') === 'true' && !!panel && !panel.hidden
}

export function isFaqOpen(button: HTMLButtonElement): boolean { return button.getAttribute('aria-expanded') === 'true' }

function menuView(button: HTMLButtonElement): MenuView {
  const panel = controlledPanel(button)
  const expanded = button.getAttribute('aria-expanded') === 'true'
  const hidden = panel ? panel.hidden : true
  return { expanded, hidden, open: expanded && !!panel && !hidden, reference: !!panel,
    label: (button.getAttribute('aria-label') ?? '').trim().length > 0, noTransition: !panelHasTransition(panel) }
}

function applyStep(adapter: BehaviorAdapter, step: Step): void {
  switch (step.kind) {
    case 'click': {
      const buttons = step.target === 'menu' ? adapter.menuButtons() : adapter.faqButtons()
      const target = buttons[step.index]
      if (!target) throw new Error(`no ${step.target} button at index ${step.index}`)
      adapter.click(target)
      return
    }
    case 'focusFirstPanelLink': {
      const button = adapter.menuButtons()[step.menu]
      const link = button && controlledPanel(button)?.querySelector('a')
      if (!link) throw new Error(`no panel link at menu ${step.menu}`)
      ;(link as HTMLElement).focus()
      if (document.activeElement !== link) throw new Error('panel link did not receive focus')
      return
    }
    case 'key':
      adapter.key(document.activeElement ?? document.body, step.key)
      return
    case 'reducedMotion':
      adapter.setReducedMotion(step.on)
      return
    default:
      applyTabStep(adapter, step)
      return
  }
}

/** Observe exactly the fields the case expects, so one comparison covers a row. */
function observe(adapter: BehaviorAdapter, expected: ExpectedView): Record<string, unknown> {
  const view: Record<string, unknown> = {}
  const menus = adapter.menuButtons()
  if (expected.menus) view.menus = menus.map(menuView)
  if (expected.focusMenu !== undefined) view.focusMenu = menus.indexOf(document.activeElement as HTMLButtonElement)
  if (expected.distinctPanels !== undefined) {
    const ids = menus.map((button) => button.getAttribute('aria-controls') ?? '')
    view.distinctPanels = ids.length === new Set(ids).size && ids.every((id) => !!document.getElementById(id))
  }
  if (expected.faq) view.faq = adapter.faqButtons().map(isFaqOpen)
  return { ...view, ...observeTabs(expected) }
}

/** Mount, drive and observe one case. Shared with the cross-environment parity runner. */
export function runCase(adapter: BehaviorAdapter, behaviorCase: BehaviorCase): Record<string, unknown> {
  adapter.mount(behaviorCase.fixture)
  for (const step of behaviorCase.steps) applyStep(adapter, step)
  return observe(adapter, behaviorCase.expect)
}

/** Replay every case through one adapter, one assertion per row. */
export function runBehaviorTable(adapter: BehaviorAdapter, cases: BehaviorCase[] = BEHAVIOR_CASES): void {
  for (const behaviorCase of cases) {
    it(`${behaviorCase.id}: ${behaviorCase.behavior} on ${behaviorCase.fixture}`, () => {
      expect(runCase(adapter, behaviorCase)).toEqual(behaviorCase.expect)
    })
  }
}
