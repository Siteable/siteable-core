/**
 * The features `display` control in the properties panel.
 *
 * The panel and the preview are rendered from the store (not from a local
 * copy), so a panel write is observed through the same re-render the editor
 * performs. A store read is used for the stored value itself: the panel shows
 * nothing about a value it did not change.
 */
import { describe, it, expect, afterEach } from 'vitest'
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

function featuresBlock(props: Record<string, unknown> = {}): BlockConfig {
  return {
    id: 'feat-1',
    type: 'features',
    variant: 'grid',
    props: {
      title: 'Capabilities',
      items: [
        { title: 'One', description: 'One description.' },
        { title: 'Two', description: 'Two description.' },
        { title: 'Three', description: 'Three description.' },
      ],
      ...props,
    },
  }
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

/** Panel and preview render from the store, so a store write re-renders both. */
function renderEditor(blockId: string): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  function Harness() {
    const block = useConfigStore((state) =>
      state.config.pages![0].blocks.find((candidate) => candidate.id === blockId),
    )
    return (
      <>
        <PropertiesPanel block={block!} />
        <div data-testid="preview">
          <RenderBlock block={block!} />
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

function clearText(container: HTMLElement, labelText: string): void {
  const label = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.trim() === labelText,
  )
  const input = label?.parentElement?.querySelector('input') as HTMLInputElement | null
  if (!input) throw new Error(`no ${labelText} input in the panel`)
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('features display control', () => {
  it('stores the tabs option and previews a tab set', () => {
    const block = featuresBlock()
    seed(block)
    const container = renderEditor(block.id)

    const select = displaySelect(container)
    expect(select.value).toBe('')
    expect(container.querySelector('[role="tablist"]')).toBeNull()

    choose(select, 'tabs')

    expect(storedProps().display).toBe('tabs')
    expect(select.value).toBe('tabs')
    expect(container.querySelector('[role="tablist"]')).not.toBeNull()
  })

  it('removes the key when the default layout is chosen and previews the default layout', () => {
    seed(featuresBlock({ display: 'tabs' }))
    const container = renderEditor('feat-1')

    expect(container.querySelector('[role="tablist"]')).not.toBeNull()
    choose(displaySelect(container), '')

    expect('display' in storedProps()).toBe(false)
    // The rest of the props survive the replacement.
    expect(storedProps().title).toBe('Capabilities')
    expect(container.querySelector('[role="tablist"]')).toBeNull()
    expect(container.textContent).toContain('Capabilities')
  })

  it('shows the default layout label and leaves an unknown value untouched', () => {
    seed(featuresBlock({ display: 'carousel' }))
    const container = renderEditor('feat-1')

    const select = displaySelect(container)
    expect(select.value).toBe('')
    expect(select.selectedOptions[0]?.textContent).toBe('Default layout')
    // Opening and showing the panel does not write the stored value away.
    expect(storedProps().display).toBe('carousel')
    expect(container.querySelector('[role="tablist"]')).toBeNull()
    // Positive counterpart: the default layout content really rendered.
    expect(container.textContent).toContain('Capabilities')
    expect(container.textContent).toContain('One description.')
  })

  it('previews the default layout when the tabs option has fewer than two items', () => {
    const block = featuresBlock({ display: 'tabs' })
    block.props.items = [{ title: 'Only one', description: 'Only description.' }]
    seed(block)
    const container = renderEditor(block.id)

    expect(displaySelect(container).value).toBe('tabs')
    expect(container.querySelector('[role="tablist"]')).toBeNull()
    expect(container.textContent).toContain('Only one')
  })

  it('keeps a cleared text field stored as an empty string, not deleted', () => {
    seed(featuresBlock())
    const container = renderEditor('feat-1')

    clearText(container, 'Title')

    expect('title' in storedProps()).toBe(true)
    expect(storedProps().title).toBe('')
  })
})
