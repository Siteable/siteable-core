/**
 * Tab-set cases and observation for the shared behavior table.
 *
 * Both environments expose the same ARIA contract (`role="tablist"`,
 * `role="tab"`, `role="tabpanel"`), so the tab rows are queried by role here
 * and need no adapter method. The editor deliberately carries no
 * `data-sb-*` hook: the export runtime ignores a tab it cannot find that way,
 * so the two environments can share one document without double handling.
 */
import type { BehaviorAdapter, BehaviorCase, ExpectedView, KeyMods } from './behavior-test-table'

/** What one tab set must look like, observed per tab in document order. */
export interface TabSetView {
  /** `aria-selected` per tab. */
  selected: boolean[]
  /** The controlled panel per tab is present and not `hidden`. */
  visible: boolean[]
  /** Roving tab order: exactly the selected tab is in the tab sequence. */
  tabStops: boolean[]
  /** Every reference resolves to a live panel of the right kind, ids unique. */
  wired: boolean
  /** The panels carry no transition or animation class and no inline transition. */
  noTransition: boolean
}

export type TabStep =
  | { kind: 'clickTab'; set: number; index: number }
  | { kind: 'focusTab'; set: number; index: number }

/**
 * Shared with the menu observation: a panel must not animate its state change.
 *
 * The utility name is taken AFTER any variant prefix, so a responsive or
 * motion-gated class (`md:transition-all`, `motion-safe:transition-opacity`)
 * counts as an animation. Matching the raw token would let every prefixed
 * transition pass this check unnoticed, which is the same prefix hole the
 * display-token check beside it already guards against.
 */
export function panelHasTransition(panel: HTMLElement | null): boolean {
  if (!panel) return false
  const hasTransition = panel.className.split(/\s+/).some((token) => {
    const name = token.split(':').pop() ?? ''
    return (name.startsWith('transition') && name !== 'transition-none') ||
      (name.startsWith('animate') && name !== 'animate-none')
  })
  return hasTransition || panel.style.transition !== ''
}

export function tabLists(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="tablist"]'))
}

export function tabsIn(list: Element): HTMLElement[] {
  return Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]'))
}

function panelOf(tab: Element): HTMLElement | null {
  return document.getElementById(tab.getAttribute('aria-controls') ?? '')
}

/** All tab and panel ids in the document are present and unique. */
function idsAreUnique(): boolean {
  const ids = Array.from(
    document.querySelectorAll<HTMLElement>('[role="tab"],[role="tabpanel"]'),
  ).map((element) => element.id)
  return ids.length > 0 && ids.every((id) => id.length > 0) && ids.length === new Set(ids).size
}

export function tabSetView(list: Element): TabSetView {
  const tabs = tabsIn(list)
  const panels = tabs.map(panelOf)
  return {
    selected: tabs.map((tab) => tab.getAttribute('aria-selected') === 'true'),
    visible: panels.map((panel) => !!panel && !panel.hidden),
    // "In the keyboard tab order" is any non-negative tabIndex. Testing
    // `=== 0` would read a non-selected tab at tabIndex 1 as absent from the
    // order, which is not what "in the keyboard tab order" means.
    tabStops: tabs.map((tab) => tab.tabIndex >= 0),
    wired: idsAreUnique() && tabs.every((tab, index) => {
      const panel = panels[index]
      return tab.getAttribute('role') === 'tab'
        && (tab.getAttribute('aria-selected') === 'true'
          || tab.getAttribute('aria-selected') === 'false')
        && tab.id.length > 0
        && !!panel
        && panel.getAttribute('role') === 'tabpanel'
        && panel.getAttribute('aria-labelledby') === tab.id
    }),
    noTransition: panels.every((panel) => !panelHasTransition(panel)),
  }
}

/** The focused tab as [set index, tab index], or null when no tab owns focus. */
export function focusedTab(): [number, number] | null {
  const lists = tabLists()
  for (let set = 0; set < lists.length; set += 1) {
    const index = tabsIn(lists[set]).indexOf(document.activeElement as HTMLElement)
    if (index >= 0) return [set, index]
  }
  return null
}

function labelOf(tab: Element): string {
  return (tab.textContent ?? '').trim()
}

/**
 * The description a panel holds. A panel leads with its heading in the export
 * (revealed by the no-script stylesheet), so the description is the panel's
 * SOLE paragraph — the same shape the preview renders. A panel that grows a
 * second paragraph returns a marker instead of silently naming the wrong node.
 */
function descriptionOf(panel: HTMLElement | null): string {
  if (!panel) return ''
  const paragraphs = Array.from(panel.querySelectorAll('p'))
  if (paragraphs.length !== 1) return `<${paragraphs.length} paragraphs>`
  return (paragraphs[0].textContent ?? '').trim()
}

/** Observe only the tab fields the case expects. */
export function observeTabs(expected: ExpectedView): Record<string, unknown> {
  const view: Record<string, unknown> = {}
  if (expected.tabs) view.tabs = tabLists().map(tabSetView)
  if (expected.focusTab !== undefined) view.focusTab = focusedTab()
  if (expected.labels) {
    view.labels = tabLists().map((list) => tabsIn(list).map(labelOf))
  }
  if (expected.descriptions) {
    view.descriptions = tabLists().map((list) =>
      tabsIn(list).map((tab) => descriptionOf(panelOf(tab))),
    )
  }
  return view
}

export function applyTabStep(adapter: BehaviorAdapter, step: TabStep): void {
  const list = tabLists()[step.set]
  if (!list) throw new Error(`no tab set at index ${step.set}`)
  const tab = tabsIn(list)[step.index]
  if (!tab) throw new Error(`no tab at index ${step.index} in set ${step.set}`)
  if (step.kind === 'clickTab') {
    adapter.click(tab)
    return
  }
  tab.focus()
  if (document.activeElement !== tab) throw new Error('tab did not receive focus')
}

const tabState = (selected: number, count = 3): TabSetView => ({
  selected: Array.from({ length: count }, (_, index) => index === selected),
  visible: Array.from({ length: count }, (_, index) => index === selected),
  tabStops: Array.from({ length: count }, (_, index) => index === selected),
  wired: true,
  noTransition: true,
})

const clickTab = (set: number, index: number): TabStep => ({ kind: 'clickTab', set, index })
const focusTab = (set: number, index: number): TabStep => ({ kind: 'focusTab', set, index })
const key = (value: string, mods?: KeyMods) => ({ kind: 'key' as const, key: value, ...(mods ? { mods } : {}) })

export const TAB_CASES: BehaviorCase[] = [
  { id: 'T1', behavior: 'tabs', fixture: 'tabs', steps: [], expect: { tabs: [tabState(0)] } },
  { id: 'T2', behavior: 'tabs', fixture: 'tabs', steps: [clickTab(0, 2)], expect: { tabs: [tabState(2)] } },
  { id: 'T3', behavior: 'tabs', fixture: 'tabs', steps: [clickTab(0, 2), focusTab(0, 2), key('ArrowRight')], expect: { tabs: [tabState(0)], focusTab: [0, 0] } },
  { id: 'T4', behavior: 'tabs', fixture: 'tabs', steps: [focusTab(0, 0), key('ArrowLeft')], expect: { tabs: [tabState(2)], focusTab: [0, 2] } },
  { id: 'T5', behavior: 'tabs', fixture: 'tabs', steps: [focusTab(0, 0), key('ArrowRight')], expect: { tabs: [tabState(1)], focusTab: [0, 1] } },
  { id: 'T6', behavior: 'tabs', fixture: 'tabs', steps: [clickTab(0, 2), focusTab(0, 2), key('Home')], expect: { tabs: [tabState(0)], focusTab: [0, 0] } },
  { id: 'T7', behavior: 'tabs', fixture: 'tabs', steps: [focusTab(0, 0), key('End')], expect: { tabs: [tabState(2)], focusTab: [0, 2] } },
  { id: 'T8', behavior: 'tabs', fixture: 'tabs', steps: [focusTab(0, 0), key('ArrowDown')], expect: { tabs: [tabState(0)] } },
  { id: 'T9', behavior: 'tabs', fixture: 'two-tab-sets', steps: [clickTab(1, 1)], expect: { tabs: [tabState(0), tabState(1)] } },
  { id: 'T10', behavior: 'tabs', fixture: 'tab-sets-shared-id', steps: [clickTab(0, 2), focusTab(1, 0), key('End')], expect: { tabs: [tabState(2), tabState(2)] } },
  { id: 'T11', behavior: 'tabs', fixture: 'tabs-blank-titles', steps: [], expect: { tabs: [tabState(0)], labels: [['Tab 1', 'Tab 2', 'Third feature']] } },
  // Each panel must hold ITS item's description, not just some description.
  { id: 'T12', behavior: 'tabs', fixture: 'tabs', steps: [], expect: { tabs: [tabState(0)], descriptions: [['First description.', 'Second description.', 'Third description.']] } },
  // Focus a tab that is NOT selected, then key: the move must start from the
  // focused tab, not from the selected one. Reading React state (or the
  // selection index) instead of the event target resolves Right from tab 1 here.
  { id: 'T13', behavior: 'tabs', fixture: 'tabs', steps: [focusTab(0, 2), key('ArrowRight')], expect: { tabs: [tabState(0)], focusTab: [0, 0] } },
  // A browser or OS shortcut that uses one of these keys (Alt+Left = Back, Cmd+Left/Right = history,
  // Ctrl+Home = scroll to top, Shift+Arrow = selection) must pass through untouched: no tab moves.
  { id: 'T14', behavior: 'tabs', fixture: 'tabs', steps: [focusTab(0, 0), key('ArrowRight', { alt: true })], expect: { tabs: [tabState(0)], focusTab: [0, 0] } },
  { id: 'T15', behavior: 'tabs', fixture: 'tabs', steps: [focusTab(0, 0), key('ArrowLeft', { meta: true })], expect: { tabs: [tabState(0)], focusTab: [0, 0] } },
  { id: 'T16', behavior: 'tabs', fixture: 'tabs', steps: [clickTab(0, 2), focusTab(0, 2), key('Home', { ctrl: true })], expect: { tabs: [tabState(2)], focusTab: [0, 2] } },
  { id: 'T17', behavior: 'tabs', fixture: 'tabs', steps: [focusTab(0, 0), key('End', { shift: true })], expect: { tabs: [tabState(0)], focusTab: [0, 0] } },
]
