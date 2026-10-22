/**
 * The whole editor layout with a host image pick hook: select a block, pick an
 * image from the properties panel, and see the value stored and exported.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EditorLayout } from '../src/editor/EditorLayout'
import { useConfigStore } from '../src/store/configStore'
import { useEditorStore } from '../src/store/editorStore'
import { exportSiteToHTML } from '../src/lib/export-html'
import type { BlockConfig } from '../src/blocks/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has no layout engine; the selected block scrolls itself into view.
Element.prototype.scrollIntoView = () => {}

let root: Root | undefined
let host: HTMLElement | undefined

const HERO_ID = 'hero-1'

beforeEach(() => {
  const hero: BlockConfig = {
    id: HERO_ID,
    type: 'hero',
    variant: 'split',
    props: { headline: 'Hello', subheadline: 'World', heroImage: '' },
  }
  useConfigStore.getState().setConfig({
    name: 'Site',
    pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [hero] }],
    blocks: [hero],
  })
  useEditorStore.getState().setActiveProject('p')
  useEditorStore.getState().selectBlock(HERO_ID)
})

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  host?.remove()
  host = undefined
  useEditorStore.getState().selectBlock(null)
})

function mount(onPickImage?: () => Promise<string | null>) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(<EditorLayout onPickImage={onPickImage} />))
}

const controls = () => Array.from(host!.querySelectorAll<HTMLButtonElement>('[data-image-pick]'))
const storedHero = () => useConfigStore.getState().config.pages![0].blocks[0].props.heroImage

async function pick(url: string) {
  mount(() => Promise.resolve(url))
  expect(controls()).toHaveLength(1)
  await act(async () => { controls()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

describe('editor layout image pick', () => {
  it('shows the control for the selected block and stores the picked URL', async () => {
    await pick('https://cdn.example/h.png')
    expect(storedHero()).toBe('https://cdn.example/h.png')
  })

  it('shows no control without a host hook', () => {
    mount()
    expect(host!.textContent).toContain('Hero Image URL')
    expect(controls()).toHaveLength(0)
  })

  it('exports a picked https URL as an image source', async () => {
    await pick('https://cdn.example/h.png')
    const html = exportSiteToHTML(useConfigStore.getState().config)
    expect(html).toContain('<img src="https://cdn.example/h.png"')
  })

  it('stores a script URL as is but never exports it as a source', async () => {
    await pick('javascript:alert(1)')
    expect(storedHero()).toBe('javascript:alert(1)')
    const html = exportSiteToHTML(useConfigStore.getState().config)
    expect(html).not.toMatch(/src="[^"]*javascript:/i)
  })
})
