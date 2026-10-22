/**
 * The card grid items editor, rendered against the config store.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CardGridItemsEditor } from '../src/editor/card-grid-items-editor/card-grid-items-editor'
import { ImagePickProvider } from '../src/editor/image-pick/image-pick-context'
import { useConfigStore } from '../src/store/configStore'
import { validateSiteConfig } from '../src/lib/generate-site'
import { exportSiteToHTML } from '../src/lib/export-html'
import type { BlockConfig } from '../src/blocks/types'
import { makeFiftyItems } from './helpers/card-grid-items-fixtures'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const LABELS = ['Image URL', 'Alt Text', 'Name', 'Description', 'Price', 'Category', 'CTA Text', 'CTA URL']

let root: Root | undefined
let host: HTMLElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  host?.remove()
  host = undefined
})

function seed(props: Record<string, unknown>) {
  const block: BlockConfig = { id: 'cg-1', type: 'card-grid', variant: 'product', props }
  useConfigStore.getState().setConfig({
    name: 'X',
    pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [block] }],
    blocks: [block],
  })
}

const stored = () => useConfigStore.getState().config.pages![0].blocks[0].props.items as Array<Record<string, unknown>>

function Harness() {
  const block = useConfigStore((s) => s.config.pages![0].blocks[0])
  return <CardGridItemsEditor block={block} label="Products" />
}

function mount(hook?: () => Promise<string | null>) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(<ImagePickProvider onPickImage={hook}><Harness /></ImagePickProvider>))
}

const rows = () => Array.from(host!.querySelectorAll<HTMLElement>('[data-card-grid-item]'))
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const btn = (row: HTMLElement, label: string) => row.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
const byText = (text: string) =>
  Array.from(host!.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text))!
const search = () => host!.querySelector<HTMLInputElement>('input[type="search"]')!
const names = () => rows().map((r) => r.querySelectorAll('input')[2].value)

function typeInto(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('empty state', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an object', {}],
    ['a string', 'x'],
    ['an empty array', []],
    ['an array without objects', [1, 'a']],
  ])('shows it for %s and Add works', (_n, value) => {
    seed(value === undefined ? {} : { items: value })
    mount()
    expect(host!.textContent).toContain('No products yet.')
    expect(rows()).toHaveLength(0)
    click(byText('Add item'))
    expect(rows()).toHaveLength(1)
    const last = stored().at(-1)!
    expect(Object.keys(last).sort()).toEqual(['alt', 'category', 'ctaText', 'ctaUrl', 'description', 'image', 'name', 'price'])
  })
})

describe('rows', () => {
  it('shows eight labelled fields in order for a sparse item', () => {
    seed({ items: [{ name: 'A' }] })
    mount()
    const labels = Array.from(rows()[0].querySelectorAll('label')).map((l) => l.textContent)
    expect(labels).toEqual(LABELS)
  })

  it('renders a lazy thumbnail only for an allowed image', () => {
    seed({ items: [
      { name: 'ok', image: 'https://img.example/a.png' },
      { name: 'none' },
      { name: 'bad', image: 'javascript:alert(1)' },
    ] })
    mount()
    const [ok, none, bad] = rows()
    const img = ok.querySelector('img')!
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('src')).toBe('https://img.example/a.png')
    expect(none.querySelector('img')).toBeNull()
    expect(bad.querySelector('img')).toBeNull()
  })

  it('writes a string when an absent key is edited', () => {
    seed({ items: [{ name: 'A' }] })
    mount()
    typeInto(rows()[0].querySelectorAll('input')[4], '12.50')
    expect(stored()[0]).toEqual({ name: 'A', price: '12.50' })
  })

  it('shows a non-string value read-only', () => {
    seed({ items: [{ name: 'A', price: 5 }] })
    mount()
    const price = rows()[0].querySelectorAll('input')[4]
    expect(price.disabled).toBe(true)
    expect(price.title).toContain('JSON panel')
    expect(stored()[0].price).toBe(5)
  })

  it('moves, duplicates and removes', () => {
    seed({ items: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] })
    mount()
    expect(btn(rows()[0], 'Move up').disabled).toBe(true)
    expect(btn(rows()[2], 'Move down').disabled).toBe(true)
    click(btn(rows()[1], 'Move up'))
    expect(stored().map((i) => i.name)).toEqual(['B', 'A', 'C'])
    click(btn(rows()[0], 'Duplicate'))
    expect(stored().map((i) => i.name)).toEqual(['B', 'B', 'A', 'C'])
    click(btn(rows()[1], 'Remove'))
    expect(stored().map((i) => i.name)).toEqual(['B', 'A', 'C'])
  })

  it('keeps the other entries untouched on an edit', () => {
    const items = [{ name: 'A' }, { name: 'B' }]
    seed({ items })
    mount()
    typeInto(rows()[0].querySelectorAll('input')[2], 'A2')
    expect(stored()[1]).toBe(items[1])
  })
})

describe('search and grouping', () => {
  it('narrows rows without changing stored order and disables reorder', () => {
    seed({ items: [{ name: 'Red Shoe' }, { name: 'Cap' }, { name: 'Blue Shoe' }] })
    mount()
    typeInto(search(), 'shoe')
    expect(names()).toEqual(['Red Shoe', 'Blue Shoe'])
    expect(host!.textContent).toContain('Reorder is off while searching or grouping.')
    for (const r of rows()) {
      expect(btn(r, 'Move up').disabled).toBe(true)
      expect(btn(r, 'Move down').disabled).toBe(true)
    }
    expect(stored().map((i) => i.name)).toEqual(['Red Shoe', 'Cap', 'Blue Shoe'])
    expect(host!.querySelectorAll('label').length).toBe(1 + 8 * 2)
  })

  it('groups by category with Uncategorised last, off by default', () => {
    seed({ items: [
      { name: 'a' }, { name: 'b', category: 'Hats' }, { name: 'c', category: ' hats ' }, { name: 'd', category: 'Bags' },
    ] })
    mount()
    const toggle = byText('Group by category')
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(host!.querySelectorAll('h4')).toHaveLength(0)
    expect(host!.textContent).not.toContain('Reorder is off')
    click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(Array.from(host!.querySelectorAll('h4')).map((h) => h.textContent)).toEqual(['Hats', 'Bags', 'Uncategorised'])
    expect(host!.textContent).toContain('Reorder is off while searching or grouping.')
    for (const r of rows()) expect(btn(r, 'Move down').disabled).toBe(true)
  })

  it('keeps the same input mounted and focused while its category is edited under grouping', () => {
    seed({ items: [{ name: 'a', category: 'Hats' }, { name: 'b', category: 'Bags' }] })
    mount()
    click(byText('Group by category'))
    const input = () => rows()[0].querySelectorAll('input')[5]
    const first = input()
    act(() => first.focus())
    typeInto(first, 'Bags')
    expect(stored()[0].category).toBe('Bags')
    expect(input()).toBe(first)
    expect(first.isConnected).toBe(true)
    expect(document.activeElement).toBe(first)
    typeInto(first, 'Bagsx')
    expect(input()).toBe(first)
    expect(document.activeElement).toBe(first)
    act(() => first.blur())
    // After focus leaves, the row joins its new group.
    expect(Array.from(host!.querySelectorAll('h4')).map((h) => h.textContent)).toEqual(['Bagsx', 'Bags'])
  })

  it('keeps an edited row visible while its input has focus even if it stops matching the search', () => {
    seed({ items: [{ name: 'Red Shoe' }, { name: 'Cap' }] })
    mount()
    typeInto(search(), 'shoe')
    expect(names()).toEqual(['Red Shoe'])
    const input = rows()[0].querySelectorAll('input')[2]
    act(() => input.focus())
    typeInto(input, 'Red Boot')
    expect(names()).toEqual(['Red Boot'])
    expect(rows()[0].querySelectorAll('input')[2]).toBe(input)
    expect(document.activeElement).toBe(input)
    act(() => input.blur())
    expect(names()).toEqual([])
  })

  it('add with a search active clears it and shows the new row', () => {
    seed({ items: [{ name: 'Red Shoe' }, { name: 'Cap' }] })
    mount()
    typeInto(search(), 'shoe')
    expect(rows()).toHaveLength(1)
    click(byText('Add item'))
    expect(search().value).toBe('')
    expect(rows()).toHaveLength(3)
  })
})

describe('store integration', () => {
  it('recomputes the view on undo and redo', () => {
    seed({ items: [{ name: 'A' }, { name: 'B' }] })
    mount()
    click(btn(rows()[0], 'Remove'))
    expect(names()).toEqual(['B'])
    act(() => useConfigStore.getState().undo())
    expect(names()).toEqual(['A', 'B'])
    act(() => useConfigStore.getState().redo())
    expect(names()).toEqual(['B'])
  })

  it('keeps the block and items through validateSiteConfig', () => {
    seed({ items: [{ name: 'A' }, { name: 'B' }] })
    mount()
    click(byText('Add item'))
    click(btn(rows()[1], 'Duplicate'))
    const { config } = useConfigStore.getState()
    const result = validateSiteConfig(JSON.parse(JSON.stringify(config)))
    const block = result.pages![0].blocks[0]
    expect(block.type).toBe('card-grid')
    expect(block.props.items).toEqual(stored())
  })
})

describe('export parity', () => {
  it('groups exactly like the exported filter buttons for the 50-item fixture', () => {
    const items = makeFiftyItems()
    seed({ items, display: 'filter' })
    mount()
    click(byText('Group by category'))
    const editor = Array.from(host!.querySelectorAll<HTMLElement>('[data-card-grid-group]'))
      .filter((g) => g.dataset.cardGridGroup !== '')
      .map((g) => [g.dataset.cardGridGroup, g.querySelector('h4')!.textContent])

    const html = exportSiteToHTML({
      name: 'X',
      blocks: [{ id: 'cg-1', type: 'card-grid', variant: 'product', props: { items, display: 'filter' } }],
    })
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const exported = Array.from(doc.querySelectorAll('[data-sb-filter-btn]'))
      .filter((b) => b.getAttribute('data-sb-filter-btn') !== '')
      .map((b) => [b.getAttribute('data-sb-filter-btn'), b.textContent])
    expect(editor).toEqual(exported)
    expect(editor).toHaveLength(11)
  })
})

describe('image pick control', () => {
  it('is absent without a hook', () => {
    seed({ items: [{ name: 'A' }, { name: 'B' }] })
    mount()
    expect(host!.querySelectorAll('[data-image-pick]')).toHaveLength(0)
  })

  it('appears once per row on the image field with a hook', () => {
    seed({ items: [{ name: 'A' }, { name: 'B' }] })
    mount(async () => 'https://img.example/x.png')
    expect(host!.querySelectorAll('[data-image-pick]')).toHaveLength(2)
    for (const r of rows()) {
      const first = r.querySelectorAll('input')[0]
      expect(first.parentElement!.querySelector('[data-image-pick]')).not.toBeNull()
    }
  })
})
