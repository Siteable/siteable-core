/**
 * The whole editor layout with a host bulk image pick hook: the button only shows
 * when the host supplies the hook, a click appends card rows, and the hook alone
 * never turns on the single image controls.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EditorLayout } from '../src/editor/EditorLayout'
import { useConfigStore } from '../src/store/configStore'
import { useEditorStore } from '../src/store/editorStore'
import type { BlockConfig } from '../src/blocks/types'
import type { PickedImageEntry } from '../src'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has no layout engine; the selected block scrolls itself into view.
Element.prototype.scrollIntoView = () => {}

let root: Root | undefined
let host: HTMLElement | undefined

const GRID_ID = 'cg-1'
const HERO_ID = 'hero-1'

beforeEach(() => {
  const blocks: BlockConfig[] = [
    { id: HERO_ID, type: 'hero', variant: 'split', props: { headline: 'Hello', subheadline: 'World', heroImage: '' } },
    { id: GRID_ID, type: 'card-grid', variant: 'product', props: { items: [{ name: 'First' }] } },
  ]
  useConfigStore.getState().setConfig({
    name: 'Site',
    pages: [{ id: 'page-home', name: 'Home', path: '/', blocks }],
    blocks,
  })
  useEditorStore.getState().setActiveProject('p')
  useEditorStore.getState().selectBlock(GRID_ID)
})

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  host?.remove()
  host = undefined
  useEditorStore.getState().selectBlock(null)
})

type Props = Parameters<typeof EditorLayout>[0]

function mount(props: Props = {}) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(<EditorLayout {...props} />))
}

const bulkButtons = () => Array.from(host!.querySelectorAll<HTMLButtonElement>('[data-bulk-image-pick]'))
const singleControls = () => host!.querySelectorAll('[data-image-pick]')
const storedItems = () => useConfigStore.getState().config.pages![0].blocks[1].props.items as Array<Record<string, unknown>>

describe('editor layout bulk image pick', () => {
  it('shows no button without a host hook', () => {
    mount()
    expect(host!.textContent).toContain('Products')
    expect(bulkButtons()).toHaveLength(0)
  })

  it('shows the button for a selected card grid and appends the picked images on click', async () => {
    // A synchronous hook is accepted, typed with the exported entry type.
    const syncHook = (): PickedImageEntry[] => [
      { url: 'https://cdn.example/a.png', name: 'Alpha' },
      { url: 'https://cdn.example/b.png' },
    ]
    mount({ onPickImages: syncHook })
    expect(bulkButtons()).toHaveLength(1)
    await act(async () => { bulkButtons()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(storedItems()).toHaveLength(3)
    expect(storedItems()[1]).toMatchObject({ image: 'https://cdn.example/a.png', name: 'Alpha' })
    expect(storedItems()[2]).toMatchObject({ image: 'https://cdn.example/b.png' })
  })

  it('accepts an asynchronous hook', async () => {
    mount({ onPickImages: async (): Promise<PickedImageEntry[] | null> => [{ url: 'https://cdn.example/c.png' }] })
    await act(async () => { bulkButtons()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(storedItems()).toHaveLength(2)
  })

  it('does not turn on the single image controls when only the bulk hook is given', () => {
    useEditorStore.getState().selectBlock(HERO_ID)
    mount({ onPickImages: () => null })
    expect(host!.textContent).toContain('Hero Image URL')
    expect(singleControls()).toHaveLength(0)
  })
})
