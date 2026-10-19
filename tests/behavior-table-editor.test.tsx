/**
 * Shared behavior table run against the React editor preview.
 *
 * The same cases and the same expected values as the exported-page run; only
 * the adapter differs. Editor updates are flushed through `act`, and the
 * reduced-motion preference is stubbed because jsdom does not implement
 * `matchMedia`.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { RenderBlock } from '../src/blocks/registry'
import {
  FIXTURE_BLOCKS,
  controlledPanel,
  isMenuOpen,
  runBehaviorTable,
  type BehaviorAdapter,
} from './helpers/behavior-test-table'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let host: HTMLElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  host?.remove()
  host = undefined
})

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
    act(() => root?.unmount())
    host?.remove()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    const blocks = FIXTURE_BLOCKS[fixture]
    act(() =>
      root!.render(
        <>
          {blocks.map((block) => (
            <RenderBlock key={block.id} block={block} />
          ))}
        </>,
      ),
    )
  },
  menuButtons: () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('nav button[aria-label="Toggle menu"]')),
  faqButtons: () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('section button[aria-expanded]')),
  click(el) {
    act(() => (el as HTMLElement).click())
  },
  key(el, key) {
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    })
  },
  setReducedMotion(on) {
    ;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = () =>
      reducedMotion(on)
  },
}

describe('editor preview behavior', () => {
  runBehaviorTable(adapter)

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
})
