/**
 * The card-grid properties panel, plus palette and layers registration.
 *
 * The panel and the preview both render from the config store, so a panel write
 * is observed through the same re-render the editor performs. The add-item path
 * is pinned to the eight item keys even when the first item is sparse, and the
 * palette insert is pinned to an empty, non-shared item list.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PropertiesPanel } from '../src/editor/PropertiesPanel'
import { RenderBlock } from '../src/blocks/registry'
import { LeftSidebar } from '../src/editor/LeftSidebar'
import { LayersPanel } from '../src/editor/LayersPanel'
import { useConfigStore } from '../src/store/configStore'
import type { BlockConfig } from '../src/blocks/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ITEM_KEYS = [
  'alt',
  'category',
  'ctaText',
  'ctaUrl',
  'description',
  'image',
  'name',
  'price',
]

const roots: Root[] = []
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots.length = 0
  document.body.innerHTML = ''
})

function blockOf(props: Record<string, unknown>): BlockConfig {
  return { id: 'cg-1', type: 'card-grid', variant: 'product', props }
}

function seed(block: BlockConfig): void {
  useConfigStore.getState().setConfig({
    name: 'X',
    pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [block] }],
    blocks: [block],
  })
}

function storedProps(): Record<string, unknown> {
  return useConfigStore.getState().config.pages![0].blocks[0].props
}

function labels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('label')).map((label) => (label.textContent ?? '').trim())
}

function field(container: HTMLElement, labelText: string): HTMLElement {
  const label = Array.from(container.querySelectorAll('label')).find(
    (candidate) => (candidate.textContent ?? '').trim() === labelText,
  )
  if (!label) throw new Error(`no "${labelText}" field in the panel`)
  return label.parentElement as HTMLElement
}

function displaySelect(container: HTMLElement): HTMLSelectElement {
  const select = field(container, 'Display').querySelector('select')
  if (!select) throw new Error('no Display select in the panel')
  return select as HTMLSelectElement
}

function choose(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
  act(() => {
    setter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

/** Seed the store, then render the panel beside a preview from the same store. */
function renderEditor(block: BlockConfig): HTMLElement {
  seed(block)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  function Harness() {
    const current = useConfigStore((state) =>
      state.config.pages![0].blocks.find((candidate) => candidate.id === block.id),
    )
    return (
      <>
        <PropertiesPanel block={current!} />
        <div data-testid="preview">
          <RenderBlock block={current!} />
        </div>
      </>
    )
  }
  act(() => root.render(<Harness />))
  return container
}

function addItem(container: HTMLElement): void {
  const button = Array.from(field(container, 'Products').querySelectorAll('button')).find(
    (candidate) => (candidate.textContent ?? '').includes('Add item'),
  )
  if (!button) throw new Error('no add-item button')
  act(() => button.click())
}

function renderStandalone(node: ReactNode): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(node))
  return container
}

describe('card grid properties panel', () => {
  it('shows title, subtitle, items and the display choice', () => {
    const container = renderEditor(blockOf({ title: '', subtitle: '', display: '', items: [] }))
    expect(labels(container)).toEqual(expect.arrayContaining(['Title', 'Subtitle', 'Products', 'Display']))

    const select = displaySelect(container)
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['', 'filter'])
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      'Default layout',
      'Category filter',
    ])
  })

  it('stores the filter choice and removes the key when the default layout is chosen', () => {
    const container = renderEditor(blockOf({ title: 'Products', items: [{ name: 'One', category: 'Shoes' }] }))
    const select = displaySelect(container)
    expect(select.value).toBe('')

    choose(select, 'filter')
    expect(storedProps().display).toBe('filter')

    choose(displaySelect(container), '')
    expect('display' in storedProps()).toBe(false)
    expect(storedProps().title).toBe('Products')
  })

  it('adds an item with every key when the list is empty', () => {
    const container = renderEditor(blockOf({ title: 'Products', items: [] }))
    addItem(container)

    const items = storedProps().items as Array<Record<string, unknown>>
    expect(items).toHaveLength(1)
    expect(Object.keys(items[0]).sort()).toEqual(ITEM_KEYS)
    expect(Object.values(items[0]).every((value) => value === '')).toBe(true)
  })

  it('adds an item with every key even when the first item is sparse', () => {
    const container = renderEditor(blockOf({ title: 'Products', items: [{ name: 'Only' }] }))
    addItem(container)

    const items = storedProps().items as Array<Record<string, unknown>>
    expect(items).toHaveLength(2)
    expect(Object.keys(items[1]).sort()).toEqual(ITEM_KEYS)
    expect(items[1].name).toBe('')
  })

  it('labels the item fields the panel renders', () => {
    const container = renderEditor(blockOf({ title: 'Products', items: [] }))
    addItem(container)
    const card = field(container, 'Products').querySelector('.bg-bg-2') as HTMLElement
    const itemLabels = Array.from(card.querySelectorAll('label')).map((label) => (label.textContent ?? '').trim())
    expect(itemLabels).toEqual([
      'Image URL', 'Alt Text', 'Name', 'Description', 'Price', 'Category', 'CTA Text', 'CTA URL',
    ])
  })
})

describe('card grid palette and layers registration', () => {
  it('inserts an empty, non-shared item list from the palette', () => {
    // Start from an empty page so the palette is the only source of blocks.
    useConfigStore.getState().setConfig({ name: 'X', pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [] }], blocks: [] })
    const container = renderStandalone(<LeftSidebar />)

    const componentsTab = Array.from(container.querySelectorAll('button')).find(
      (button) => (button.textContent ?? '').trim() === 'Components',
    )!
    act(() => componentsTab.click())

    const addCard = (): void => {
      const button = Array.from(container.querySelectorAll('button')).find(
        (candidate) => (candidate.textContent ?? '').trim().startsWith('Card Grid'),
      )
      if (!button) throw new Error('Card Grid is missing from the palette')
      act(() => button.click())
    }
    addCard()
    addCard()

    const blocks = useConfigStore.getState().config.pages![0].blocks
    expect(blocks.map((block) => block.type)).toEqual(['card-grid', 'card-grid'])
    expect(blocks[0].props.items).toEqual([])
    expect(blocks[1].props.items).toEqual([])
    // A deep copy per insert: editing one list cannot mutate the other.
    expect(blocks[0].props.items).not.toBe(blocks[1].props.items)
  })

  it('names the block in the layers panel', () => {
    seed(blockOf({ title: 'Products', items: [{ name: 'One' }] }))
    const container = renderStandalone(<LayersPanel />)
    expect(container.textContent).toContain('Card Grid')
  })
})
