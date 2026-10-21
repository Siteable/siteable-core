/**
 * The carousel `display` control in the properties panel. Panel and preview
 * render from the store, so a panel write is observed through the same
 * re-render the editor performs; the stored value is read back from the store.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PropertiesPanel } from '../src/editor/PropertiesPanel'
import { RenderBlock } from '../src/blocks/registry'
import { useConfigStore } from '../src/store/configStore'
import type { BlockConfig } from '../src/blocks/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots.length = 0
  document.body.innerHTML = ''
})

type Kind = 'testimonials' | 'gallery'
const KINDS: Kind[] = ['testimonials', 'gallery']

/** A three-item block of the requested type, with distinct text per item. */
function blockOf(kind: Kind, props: Record<string, unknown> = {}): BlockConfig {
  const items = [
    { name: 'Ann', role: 'Founder', quote: 'First quote' },
    { name: 'Bo', role: 'Lead', quote: 'Second quote' },
    { name: 'Cy', role: 'Editor', quote: 'Third quote' },
  ]
  const images = [
    { src: '', alt: 'One', caption: 'First caption' },
    { src: '', alt: 'Two', caption: 'Second caption' },
    { src: '', alt: 'Three', caption: 'Third caption' },
  ]
  return {
    id: kind === 'testimonials' ? 'test-1' : 'gal-1',
    type: kind,
    variant: kind === 'testimonials' ? 'cards' : 'grid',
    props: {
      title: TITLE[kind],
      ...(kind === 'testimonials' ? { items } : { images }),
      ...props,
    },
  }
}

const TITLE: Record<Kind, string> = { testimonials: 'Stories', gallery: 'Pictures' }
/** Text only the DEFAULT layout renders for this block type. */
const DEFAULT_MARKER: Record<Kind, string> = { testimonials: 'First quote', gallery: 'First caption' }
const ONE_ITEM: Record<Kind, { props: Record<string, unknown>; marker: string }> = {
  testimonials: { props: { items: [{ name: 'Ann', role: 'Founder', quote: 'Only quote' }] }, marker: 'Only quote' },
  gallery: { props: { images: [{ src: '', alt: 'One', caption: 'Only caption' }] }, marker: 'Only caption' },
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

/** Seed the store, then render the panel beside the preview from it. */
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

function displaySelect(container: HTMLElement): HTMLSelectElement {
  const label = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.trim() === 'Display',
  )
  const select = label?.parentElement?.querySelector('select')
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

function preview(container: HTMLElement): HTMLElement {
  const node = container.querySelector<HTMLElement>('[data-testid="preview"]')
  if (!node) throw new Error('no preview container')
  return node
}

function region(container: HTMLElement): HTMLElement | null {
  return preview(container).querySelector<HTMLElement>('[role="region"][aria-roledescription="carousel"]')
}

describe.each(KINDS)('%s carousel display control', (kind) => {
  it('stores the carousel option and previews a carousel', () => {
    const container = renderEditor(blockOf(kind))

    const select = displaySelect(container)
    expect(select.value).toBe('')
    expect(region(container)).toBeNull()

    choose(select, 'carousel')

    expect(storedProps().display).toBe('carousel')
    expect(select.value).toBe('carousel')
    const found = region(container)
    expect(found).not.toBeNull()

    // The region resolves its name to a live element with text.
    const labelledBy = found!.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect((document.getElementById(labelledBy!)?.textContent ?? '').trim()).not.toBe('')

    const slides = [...found!.querySelectorAll('[role="group"][aria-roledescription="slide"]')]
    expect(slides.map((slide) => (slide as HTMLElement).hidden)).toEqual([false, true, true])
    // Each slide holds ITS OWN item, in author order — not just some item.
    expect(slides[1].textContent).toContain(kind === 'testimonials' ? 'Second quote' : 'Second caption')
  })

  it('removes the key when the default layout is chosen and previews the default layout', () => {
    const container = renderEditor(blockOf(kind, { display: 'carousel' }))

    expect(region(container)).not.toBeNull()
    choose(displaySelect(container), '')

    expect('display' in storedProps()).toBe(false)
    // The rest of the props survive the replacement.
    expect(storedProps().title).toBe(TITLE[kind])
    expect(region(container)).toBeNull()
    expect(preview(container).textContent).toContain(DEFAULT_MARKER[kind])
  })

  it('shows the default layout label and leaves an unknown value untouched', () => {
    const container = renderEditor(blockOf(kind, { display: 'Carousel' }))

    const select = displaySelect(container)
    expect(select.value).toBe('')
    expect(select.selectedOptions[0]?.textContent).toBe('Default layout')
    // Rendering the panel does not write the stored value away.
    expect(storedProps().display).toBe('Carousel')
    expect(region(container)).toBeNull()
    expect(preview(container).textContent).toContain(DEFAULT_MARKER[kind])
  })

  it('previews the default layout when the option has fewer than two items', () => {
    const container = renderEditor(blockOf(kind, { display: 'carousel', ...ONE_ITEM[kind].props }))

    expect(displaySelect(container).value).toBe('carousel')
    expect(region(container)).toBeNull()
    expect(preview(container).textContent).toContain(ONE_ITEM[kind].marker)
  })

  it('renders the carousel preview without any data attribute hook', () => {
    const container = renderEditor(blockOf(kind))
    choose(displaySelect(container), 'carousel')

    const attributes = [...preview(container).querySelectorAll('*')].flatMap((element) =>
      [...element.attributes].map((attribute) => attribute.name),
    )
    expect(attributes.filter((name) => name.startsWith('data-sb-'))).toEqual([])
  })
})

it('never schedules a timer, so the preview cannot advance on its own', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../src/blocks/carousel/CarouselRegion.tsx'),
    'utf8',
  )
  expect(source).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/)
})
