/**
 * SC-004 — the add-page flow is a gate, not a passthrough.
 *
 * Requirement: FR-003 (with FR-002's shape predicate), covering SC-004. `page-path.test.ts` already pins
 * the pure predicate/normalizer; what nothing covered is the EDITOR SEAM — the
 * popover accepting a bad path, hand-normalizing a good one, or duplicating an
 * existing page. A `normalizePagePaths` that always rewrites is exactly what
 * would let `/About` through as a silently-rewritten `/about`.
 *
 * Therefore: rejected paths must surface an inline reason AND leave the page
 * list untouched; an accepted path must be stored AS ENTERED (`/team`, not a
 * rewritten variant).
 *
 * No @testing-library dependency — react-dom/client + act + jsdom, matching
 * `sc-m02-panel-to-publish.test.tsx`.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CanvasToolbar } from '../src/editor/CanvasToolbar'
import { useConfigStore } from '../src/store/configStore'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots.length = 0
  document.body.innerHTML = ''
})

/** Seed the store with `/` and `/about` — two pages, per the SC-004 fixture. */
function seedPages(): void {
  useConfigStore.getState().setConfig({
    name: 'X',
    pages: [
      { id: 'p1', name: 'Home', path: '/', blocks: [] },
      { id: 'p2', name: 'About', path: '/about', blocks: [] },
    ],
    blocks: [],
  })
}

function renderToolbar(): HTMLElement {
  seedPages()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(<CanvasToolbar />)
  })
  return container
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/**
 * Type one character at a time, firing a separate `input` event per keystroke —
 * the way a user actually reaches the field. `setInputValue` is a single bulk
 * assignment (a paste), which cannot tell a suggestion that tracks the name
 * from one that froze on the first character.
 */
function typeInto(input: HTMLInputElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  for (let i = 1; i <= text.length; i++) {
    act(() => {
      setter.call(input, text.slice(0, i))
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
}

/** The popover's two inputs, found by their visible labels. */
function popoverInputs(container: HTMLElement) {
  const label = (text: string) =>
    [...container.querySelectorAll('label')].find((l) => l.textContent?.trim() === text)
  const nameInput = label('Page name')?.parentElement?.querySelector('input') as HTMLInputElement | null
  const pathInput = label('Path')?.parentElement?.querySelector('input') as HTMLInputElement | null
  if (!nameInput || !pathInput) throw new Error('add-page popover inputs not found')
  return { nameInput, pathInput }
}

function addPageButton(container: HTMLElement): HTMLElement {
  const btn = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Add Page')
  if (!btn) throw new Error('"Add Page" submit button not found')
  return btn
}

/** Open the popover via its real aria-label affordance. */
function openPopover(container: HTMLElement): void {
  const trigger = container.querySelector('[aria-label="Add page"]') as HTMLElement | null
  if (!trigger) throw new Error('"Add page" trigger button not found')
  act(() => {
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/** Press Enter on a field — a second route into `submit()`, bypassing the button. */
function pressEnter(input: HTMLInputElement): void {
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}

/** Type a name, then force the path, then submit — exactly the user flow. */
function submitNewPage(container: HTMLElement, name: string, path: string): void {
  const { nameInput, pathInput } = popoverInputs(container)
  setInputValue(nameInput, name)
  setInputValue(pathInput, path)
  act(() => {
    addPageButton(container).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/** Submit via the Enter key on the Path field instead of the button. */
function submitNewPageWithEnter(container: HTMLElement, name: string, path: string): void {
  const { nameInput, pathInput } = popoverInputs(container)
  setInputValue(nameInput, name)
  setInputValue(pathInput, path)
  pressEnter(pathInput)
}

/** The inline rejection reason, if the flow showed one. */
function inlineReason(container: HTMLElement): string {
  const alert = container.querySelector('[role="alert"]')
  return alert?.textContent?.trim() ?? ''
}

/** Is the add-page popover currently rendered? (`Add Page` submit button.) */
function isPopoverOpen(container: HTMLElement): boolean {
  return [...container.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Add Page')
}

const pageCount = () => useConfigStore.getState().config.pages!.length

describe('SC-004 — add-page rejects invalid/duplicate paths with an inline reason', () => {
  const REJECTED: Array<[label: string, path: string]> = [
    ['uppercase (shape violation)', '/About'],
    ['a .html file suffix (shape violation)', '/about.html'],
    ['a duplicate of an existing page path', '/about'],
    ['too many path segments (shape violation)', '/a/b/c/d'],
  ]

  for (const [label, path] of REJECTED) {
    it(`rejects ${label} and leaves the page list unchanged`, () => {
      const container = renderToolbar()
      openPopover(container)
      const before = structuredClone(useConfigStore.getState().config.pages!)

      submitNewPage(container, 'Rejected', path)

      expect(pageCount(), `${path} must not add a page`).toBe(2)
      expect(
        inlineReason(container),
        `${path} must be rejected with a visible inline reason`,
      ).not.toBe('')
      // "Leaving the page list unchanged" is stronger than "same length" — a
      // rejected add must not rewrite the pages that are already there.
      expect(useConfigStore.getState().config.pages!).toEqual(before)
      // Rejection keeps the popover open so the user can correct the path.
      expect(isPopoverOpen(container), `${path} must leave the popover open`).toBe(true)
    })
  }

  it('accepts a valid unique path and stores it as entered', () => {
    const container = renderToolbar()
    openPopover(container)

    submitNewPage(container, 'Team', '/team')

    expect(inlineReason(container), '/team must not be rejected').toBe('')
    const pages = useConfigStore.getState().config.pages!
    expect(pages).toHaveLength(3)
    // Accepted AS ENTERED — not lowercased, slugged, or otherwise rewritten.
    expect(pages[pages.length - 1].path).toBe('/team')
    // A successful add closes the popover — the opposite of a rejection.
    expect(isPopoverOpen(container), 'a successful add must close the popover').toBe(false)
  })

  it('accepts a multi-segment valid path verbatim, not slugified or lowercased', () => {
    // `/team` is already lowercase and single-segment, so on its own it cannot
    // tell "stored as entered" apart from "stored lowercased". A valid-but-not-
    // already-normalized path is what actually pins FR-003's "as entered"
    // clause: an implementation that lowercases or flattens on the way to the
    // store fails here.
    const container = renderToolbar()
    openPopover(container)

    submitNewPage(container, 'Docs', '/docs/v2')

    const pages = useConfigStore.getState().config.pages!
    expect(pages).toHaveLength(3)
    expect(pages[pages.length - 1].path).toBe('/docs/v2')
  })

  it('clears the inline reason when the user edits the path', () => {
    const container = renderToolbar()
    openPopover(container)

    submitNewPage(container, 'Rejected', '/About')
    expect(inlineReason(container)).not.toBe('')

    setInputValue(popoverInputs(container).pathInput, '/about-us')

    expect(inlineReason(container), 'a stale reason must not outlive the input').toBe('')
  })

  it('derives a valid default path when the Path field is left empty', () => {
    // The `path.trim() || derived-from-name` fallback is the flow a user hits by
    // simply typing a name. Nothing else in this suite exercises it, so a
    // regression that rejects an empty Path field would ship silently.
    const container = renderToolbar()
    openPopover(container)
    const { nameInput, pathInput } = popoverInputs(container)

    setInputValue(nameInput, 'Team')
    setInputValue(pathInput, '')
    act(() => {
      addPageButton(container).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const pages = useConfigStore.getState().config.pages!
    expect(pages).toHaveLength(3)
    expect(pages[pages.length - 1].path).toBe('/team')
  })

  it('rejects "/" — page 1\'s own path', () => {
    // The Path field OPENS on '/', which is exactly page 1's path, so submitting
    // without correcting it is a duplicate of the home page. Typing a name
    // auto-fills the path, so the reachable route is a user who sets Path back
    // to '/' (or never lets the suggestion apply).
    const container = renderToolbar()
    openPopover(container)
    const { nameInput, pathInput } = popoverInputs(container)

    expect(pathInput.value, 'the Path field opens on "/"').toBe('/')
    setInputValue(nameInput, 'Second Home')
    setInputValue(pathInput, '/')
    pressEnter(pathInput)

    expect(pageCount(), 'a second "/" page must not be added').toBe(2)
    expect(inlineReason(container)).not.toBe('')
  })

  it('submits through the Enter key as well as the button', () => {
    // Enter on a field calls submit() unconditionally, bypassing the button's
    // `disabled={!name.trim()}`. That second route needs its own coverage.
    const container = renderToolbar()
    openPopover(container)

    submitNewPageWithEnter(container, 'Team', '/team')

    expect(inlineReason(container)).toBe('')
    const pages = useConfigStore.getState().config.pages!
    expect(pages).toHaveLength(3)
    expect(pages[pages.length - 1].path).toBe('/team')
  })

  it('adds nothing for a whitespace-only name, even via Enter', () => {
    // The Enter handler does not consult the button's `disabled` state, so the
    // `!trimmed` guard in submit() is the only thing standing between a blank
    // name and a nameless page.
    const container = renderToolbar()
    openPopover(container)
    const { nameInput, pathInput } = popoverInputs(container)

    setInputValue(nameInput, '   ')
    setInputValue(pathInput, '/team')
    pressEnter(pathInput)

    expect(pageCount(), 'a whitespace-only name must not add a page').toBe(2)
  })

  it('trims the stored name', () => {
    const container = renderToolbar()
    openPopover(container)

    submitNewPage(container, '  Padded Name  ', '/team')

    const pages = useConfigStore.getState().config.pages!
    expect(pages[pages.length - 1].name).toBe('Padded Name')
  })
})

/**
 * SC-003 — the SUGGESTED path is produced by the canonical rule-1 slugifier in
 * `src/lib/page-path.ts`, so the editor never rejects a value it suggested.
 *
 * Before the fix the popover ran a second, weaker slugifier (lowercase +
 * spaces-to-dashes) that left `&`, accents and every other non-`[a-z0-9]`
 * character in place. The suggestion then failed the FR-003 `isValidPagePath`
 * gate and the user got an error on a field they never typed. Each case below
 * is one where that old slugifier's answer is shape-INVALID, so the test fails
 * if the canonical slugifier is reverted.
 */
describe('SC-003 — the add-page suggestion uses the canonical slugifier', () => {
  const SUGGESTED: Array<[name: string, expected: string]> = [
    ['Contact & Info', '/contact-info'],
    ['Café', '/caf'],
    ['Giới thiệu', '/gi-i-thi-u'],
    ['About Us', '/about-us'],
    ['  Spaced  ', '/spaced'],
    ['!!!', '/'],
  ]

  for (const [name, expected] of SUGGESTED) {
    it(`suggests ${JSON.stringify(name)} as ${expected}`, () => {
      const container = renderToolbar()
      openPopover(container)
      const { nameInput, pathInput } = popoverInputs(container)

      // Type ONLY the name — the Path field is never touched, so whatever it
      // holds afterwards is the suggestion the component computed for itself.
      setInputValue(nameInput, name)

      expect(pathInput.value, `suggestion for ${JSON.stringify(name)}`).toBe(expected)
    })
  }

  it('tracks the name as it is TYPED, not just when it is pasted in at once', () => {
    // The bulk-assignment helper above is a paste. Typing character by
    // character is the real flow, and it is where the previous
    // `!path || path === '/'` guard failed: the first keystroke turned the
    // field's opening `/` into `/c`, the guard was then false forever, and
    // "Contact & Info" was left suggested as `/c`. One `input` event per
    // character is the only way to observe that.
    const container = renderToolbar()
    openPopover(container)
    const { nameInput, pathInput } = popoverInputs(container)

    typeInto(nameInput, 'Contact & Info')

    expect(pathInput.value, 'per-keystroke suggestion').toBe('/contact-info')

    act(() => {
      addPageButton(container).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(inlineReason(container), 'a valid typed name must not be rejected').toBe('')
    const pages = useConfigStore.getState().config.pages!
    expect(pages[pages.length - 1].path).toBe('/contact-info')
  })

  it('keeps a path the user typed, even when it is "/"', () => {
    // Value-sniffing could not tell "the suggestion is still `/`" from "the user
    // typed `/`", so a deliberate `/` was overwritten by the next name change.
    // The suggestion now tracks INTENT, not the value.
    const container = renderToolbar()
    openPopover(container)
    const { nameInput, pathInput } = popoverInputs(container)

    setInputValue(nameInput, 'Team')
    setInputValue(pathInput, '/')
    typeInto(nameInput, 'Team Two')

    expect(pathInput.value, 'a user-typed "/" must survive').toBe('/')
  })

  it('accepts a name-only add and stores the suggested path', () => {
    // End-to-end teeth: with the old inline slugifier the suggestion here was
    // `/contact-&-info`, which `isValidPagePath` rejects — so the page was
    // never added and the user saw an error on an untouched field. This asserts
    // both halves of that regression at once.
    const container = renderToolbar()
    openPopover(container)
    const { nameInput, pathInput } = popoverInputs(container)

    setInputValue(nameInput, 'Contact & Info')
    act(() => {
      addPageButton(container).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(inlineReason(container), 'a valid name must not be rejected').toBe('')
    const pages = useConfigStore.getState().config.pages!
    expect(pages).toHaveLength(3)
    expect(pages[pages.length - 1].path).toBe('/contact-info')
    expect(pages[pages.length - 1].name).toBe('Contact & Info')
    // The suggestion is only a default: the Path field must still be editable.
    expect(pathInput.value).toBe('/contact-info')
  })

  it('canonicalises at SUBMIT too, when the Path field is emptied', () => {
    // The suggestion is recomputed a second time in `submit()` for a user who
    // cleared the Path field. That seam is only distinguishable from the
    // name-change one if the name is one the OLD inline slugifier got wrong:
    // with `Team` both slugifiers answer `/team`, so a partial revert of just
    // this site passes the behavioural suite and only the source scan catches
    // it. This case is the behavioural half of that coverage.
    const container = renderToolbar()
    openPopover(container)
    const { nameInput, pathInput } = popoverInputs(container)

    setInputValue(nameInput, 'Contact & Info')
    setInputValue(pathInput, '')
    act(() => {
      addPageButton(container).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(inlineReason(container), 'a valid name must not be rejected').toBe('')
    const pages = useConfigStore.getState().config.pages!
    expect(pages[pages.length - 1].path).toBe('/contact-info')
  })

  it('falls back to the duplicate reason when a name slugifies to nothing', () => {
    // FR-R3: `!!!` has no slug, so the suggestion is `/` — page 1's own path —
    // and the existing exact-duplicate check gives the accurate message rather
    // than a shape error blaming the Path field.
    const container = renderToolbar()
    openPopover(container)
    const { nameInput } = popoverInputs(container)

    setInputValue(nameInput, '!!!')
    act(() => {
      addPageButton(container).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(pageCount()).toBe(2)
    expect(inlineReason(container), 'the reason must be about the duplicate "/"').toContain(
      'A page already uses /',
    )
  })

  it('never suggests a path containing &, . or %', () => {
    const container = renderToolbar()
    openPopover(container)
    const { nameInput, pathInput } = popoverInputs(container)

    for (const name of ['A & B', '100% Coverage', 'About.html', 'Café & Co.', 'Q&A']) {
      setInputValue(nameInput, name)
      expect(pathInput.value, `suggestion for ${JSON.stringify(name)}`).not.toMatch(/[&.%]/)
    }
  })

  it('keeps deriving the suggestion only while the Path field is untouched', () => {
    // A suggestion that overwrites a path the user typed would be a new defect:
    // the guard must be on "the path is still the default", not on "always".
    const container = renderToolbar()
    openPopover(container)
    const { nameInput, pathInput } = popoverInputs(container)

    setInputValue(pathInput, '/team')
    setInputValue(nameInput, 'Later Name')

    expect(pathInput.value, 'a user-entered path must not be overwritten').toBe('/team')
  })
})

// FR-R1 — "no third slugifier may exist". A behavioural test cannot see a
// private inline helper that happens to agree today, so the file is scanned
// directly. The subject is named as a literal path (not looped over a shared
// list of files), so deleting the component or moving the helper cannot shrink
// the check away with it.
describe('SC-003 — no second slugifier in the add-page popover', () => {
  const CANVAS_TOOLBAR = 'src/editor/CanvasToolbar.tsx'

  it('has no inline slugifier left in CanvasToolbar', () => {
    const source = readFileSync(resolve(__dirname, '..', CANVAS_TOOLBAR), 'utf-8')

    // Both anchors are asserted BEFORE slicing. `indexOf` returns -1 for a
    // missing anchor and `slice(a, -1)` would then cover almost the whole file,
    // where `handleExport`'s legitimate download-FILENAME slug trips the scan
    // and sends a maintainer to delete correct code. Failing on the anchors
    // makes a rename a loud, honest failure instead of a false positive.
    const start = source.indexOf('function AddPagePopover')
    const end = source.indexOf('function PageTab')
    expect(start, 'the AddPagePopover anchor is gone — update this scan').toBeGreaterThanOrEqual(0)
    expect(end, 'the PageTab anchor is gone — update this scan').toBeGreaterThan(start)

    // Scope the scan to the popover, not the whole file: `handleExport` has a
    // legitimate lowercase+slug for the DOWNLOAD FILENAME (`.html`), which is
    // not a page path and must not be conflated with FR-R1's "no third
    // slugifier".
    const popover = source.slice(start, end)
    expect(popover, 'the exact expression the defect was built from').not.toMatch(
      /replace\(\/\\s\+\/g, '-'\)/,
    )
    expect(popover, 'the popover must not lowercase by hand either').not.toMatch(/toLowerCase\(\)/)

    // FR-R1 says the suggestion comes from the canonical module; assert the
    // import is actually there rather than assuming it.
    expect(source).toMatch(/import \{[^}]*slugifyPagePath[^}]*\} from '@\/lib\/page-path'/)
  })
})
