/**
 * Shared behavior table run against the React editor preview.
 *
 * The same cases and the same expected values as the exported-page run; only
 * the adapter differs. Editor updates are flushed through `act`, and the
 * reduced-motion preference is stubbed because jsdom does not implement
 * `matchMedia`.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { RenderBlock } from '../src/blocks/registry'
import type { BlockConfig } from '../src/blocks/types'
import {
  BEHAVIOR_CASES,
  EDITOR_CASES,
  FIXTURE_BLOCKS,
  controlledPanel,
  isMenuOpen,
  runBehaviorTable,
  type BehaviorAdapter,
} from './helpers/behavior-test-table'
import { FILTER_CASES } from './helpers/behavior-test-table-filter'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let host: HTMLElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  host?.remove()
  host = undefined
})

/** Mount blocks in a fresh host. Index keys: a fixture may repeat a block id. */
function renderBlocks(blocks: BlockConfig[]): void {
  act(() => root?.unmount())
  host?.remove()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() =>
    root!.render(
      <>
        {blocks.map((block, index) => (
          <RenderBlock key={index} block={block} />
        ))}
      </>,
    ),
  )
}

function reducedMotion(on: boolean): MediaQueryList {
  return {
    matches: on,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  } as MediaQueryList
}

const adapter: BehaviorAdapter = {
  mount(fixture) {
    ;(window as unknown as { matchMedia?: unknown }).matchMedia = undefined
    renderBlocks(FIXTURE_BLOCKS[fixture])
  },
  menuButtons: () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('nav button[aria-label="Toggle menu"]')),
  faqButtons: () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('section button[aria-expanded]')),
  click(el) {
    act(() => (el as HTMLElement).click())
  },
  key(el, key, mods) {
    act(() => {
      el.dispatchEvent(
        new KeyboardEvent('keydown', {
          key,
          bubbles: true,
          altKey: !!mods?.alt,
          ctrlKey: !!mods?.ctrl,
          metaKey: !!mods?.meta,
          shiftKey: !!mods?.shift,
        }),
      )
    })
  },
  setReducedMotion(on) {
    ;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = () =>
      reducedMotion(on)
  },
}

describe('editor preview behavior', () => {
  runBehaviorTable(adapter, EDITOR_CASES)

  // The table only sees the resulting state; these two assertions pin
  // contracts that are editor-specific (a window-level Escape already exists
  // in the editor, and the faq answer relationship must be per row).
  it.each([0, 1])('keeps Escape inside navbar %i instead of the document', (index) => {
    adapter.mount('two-navbars')
    const button = adapter.menuButtons()[index]
    adapter.click(button)
    const link = controlledPanel(button)?.querySelector('a') as HTMLElement
    link.focus()

    let reachedWindow = false
    const spy = () => {
      reachedWindow = true
    }
    window.addEventListener('keydown', spy)
    try {
      adapter.key(link, 'Escape')
    } finally {
      window.removeEventListener('keydown', spy)
    }

    expect(reachedWindow).toBe(false)
    expect(isMenuOpen(button)).toBe(false)
    expect(document.activeElement).toBe(button)
  })

  it('lets Escape pass through when the menu is closed', () => {
    adapter.mount('navbar')
    const button = adapter.menuButtons()[0]
    button.focus()

    let reachedWindow = false
    const spy = () => {
      reachedWindow = true
    }
    window.addEventListener('keydown', spy)
    try {
      adapter.key(button, 'Escape')
    } finally {
      window.removeEventListener('keydown', spy)
    }

    expect(reachedWindow).toBe(true)
    expect(document.activeElement).toBe(button)
  })

  it('keeps the faq reduced-motion classes on every row', () => {
    adapter.mount('faq')
    const buttons = adapter.faqButtons()
    expect(buttons).toHaveLength(3)
    buttons.forEach((button) => {
      const chevron = button.querySelector('svg')
      expect(chevron?.classList.contains('motion-reduce:transition-none')).toBe(true)
      expect(
        (button.nextElementSibling as HTMLElement).classList.contains('motion-reduce:transition-none'),
      ).toBe(true)
    })
  })

  it('gives every faq answer an id its own button controls', () => {
    adapter.mount('faq')
    const buttons = adapter.faqButtons()
    const ids = buttons.map((button) => button.getAttribute('aria-controls') ?? '')

    expect(buttons).toHaveLength(3)
    expect(new Set(ids).size).toBe(ids.length)
    buttons.forEach((button, index) => {
      expect(controlledPanel(button)?.textContent).toContain(['One.', 'Two.', 'Three.'][index])
    })
  })

  // Editor-specific contracts: the shared table sees state, not markup hooks
  // or a mid-edit item list.
  it('renders the tab preview without any data attribute hook', () => {
    adapter.mount('tabs')

    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(3)
    const attributes = Array.from(document.querySelectorAll('*')).flatMap((element) =>
      Array.from(element.attributes).map((attribute) => attribute.name),
    )
    expect(attributes.filter((name) => name.startsWith('data-sb-'))).toEqual([])
  })

  it('clamps the selected tab when items shrink while the preview is open', () => {
    adapter.mount('tabs')
    const tabs = () => Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'))
    act(() => tabs()[2].click())
    expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true'])

    const block = FIXTURE_BLOCKS.tabs[0]
    const shrunk = {
      ...block,
      props: { ...block.props, items: (block.props.items as unknown[]).slice(0, 2) },
    }
    act(() => root!.render(<><RenderBlock key={0} block={shrunk} /></>))

    expect(tabs()).toHaveLength(2)
    expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true'])
    const panels = Array.from(document.querySelectorAll<HTMLElement>('[role="tabpanel"]'))
    expect(panels.map((panel) => panel.hidden)).toEqual([true, false])
  })

  it('falls back to Tab N for a non-string item title', () => {
    const block = FIXTURE_BLOCKS.tabs[0]
    renderBlocks([
      {
        ...block,
        props: {
          ...block.props,
          items: [
            { title: 7, description: 'Numeric title.' },
            { title: 'Second', description: 'Second description.' },
          ],
        },
      },
    ])

    const labels = Array.from(document.querySelectorAll('[role="tab"]')).map((tab) =>
      (tab.textContent ?? '').trim(),
    )
    expect(labels).toEqual(['Tab 1', 'Second'])
  })

  it('falls back to the default layout when items drop below two', () => {
    adapter.mount('tabs')
    const block = FIXTURE_BLOCKS.tabs[0]
    const single = {
      ...block,
      props: { ...block.props, items: (block.props.items as unknown[]).slice(0, 1) },
    }
    act(() => root!.render(<><RenderBlock key={0} block={single} /></>))

    expect(document.querySelector('[role="tablist"]')).toBeNull()
    expect(document.body.textContent).toContain('First feature')
  })
})

describe('behavior table export-only marker', () => {
  // Both directions and the count: a row cannot be silently dropped from the
  // editor run unless it is a filter row, and a filter row cannot leak into it.
  it('marks exactly the filter rows export-only', () => {
    const exportOnly = BEHAVIOR_CASES.filter((behaviorCase) => behaviorCase.exportOnly)
    expect(exportOnly.length).toBeGreaterThan(0)
    expect(exportOnly.every((behaviorCase) => behaviorCase.behavior === 'filter')).toBe(true)
    expect(
      BEHAVIOR_CASES.filter((behaviorCase) => behaviorCase.behavior === 'filter').every(
        (behaviorCase) => behaviorCase.exportOnly,
      ),
    ).toBe(true)
    expect(EDITOR_CASES.length).toBe(BEHAVIOR_CASES.length - FILTER_CASES.length)
    expect(BEHAVIOR_CASES.some((behaviorCase) => behaviorCase.behavior === 'filter')).toBe(true)
    expect(EDITOR_CASES.some((behaviorCase) => behaviorCase.behavior === 'filter')).toBe(false)
  })

  // The export run replays the DEFAULT list; this pins both that every filter
  // row is on it and that the export call site has not been switched over.
  it('keeps every filter row on the list the export run replays', () => {
    expect(BEHAVIOR_CASES.map((behaviorCase) => behaviorCase.id)).toEqual(
      expect.arrayContaining(FILTER_CASES.map((behaviorCase) => behaviorCase.id)),
    )
    const source = readFileSync(
      resolve(import.meta.dirname, 'behavior-table-export.test.ts'),
      'utf8',
    )
    expect(source).toMatch(/runBehaviorTable\(adapter\)/)
    expect(source).not.toMatch(/runBehaviorTable\(adapter,\s*EDITOR_CASES\)/)
  })
})
