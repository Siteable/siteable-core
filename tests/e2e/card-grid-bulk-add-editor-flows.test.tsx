/**
 * Bulk add end to end: a host picker returns several images, the full editor
 * appends them as card rows, and the exported site shows them. One undo takes
 * them all back, grouping puts them under "Uncategorised", and the result is
 * still a valid site configuration.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EditorLayout } from '../../src/editor/EditorLayout'
import { useConfigStore } from '../../src/store/configStore'
import { useEditorStore } from '../../src/store/editorStore'
import { exportSiteToHTML } from '../../src/lib/export-html'
import { validateSiteConfig } from '../../src/lib/generate-site'
import type { BlockConfig } from '../../src/blocks/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has no layout engine; the selected block scrolls itself into view.
Element.prototype.scrollIntoView = () => {}

const GRID_ID = 'cg-1'
const PICKED = [
  { url: 'https://cdn.example/blue-shoe.png', name: 'Blue Shoe' },
  { url: 'https://cdn.example/red-hat.png', name: 'Red Hat' },
  { url: 'https://cdn.example/fish.png', name: 'Fish & Chips' },
]

let root: Root | undefined
let host: HTMLElement | undefined

beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  const grid: BlockConfig = {
    id: GRID_ID,
    type: 'card-grid',
    variant: 'product',
    props: { items: [{ name: 'Old Boot', category: 'Shoes', image: 'https://cdn.example/boot.png' }] },
  }
  useConfigStore.getState().setConfig({
    name: 'Shop',
    pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [grid] }],
    blocks: [grid],
  })
  useEditorStore.getState().setActiveProject('p')
  useEditorStore.getState().selectBlock(GRID_ID)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(<EditorLayout onPickImages={() => PICKED} />))
})

afterEach(() => {
  vi.restoreAllMocks()
  act(() => root?.unmount())
  root = undefined
  host?.remove()
  host = undefined
  useEditorStore.getState().selectBlock(null)
})

const config = () => useConfigStore.getState().config
const html = () => exportSiteToHTML(config())
const bulkButton = () => host!.querySelector<HTMLButtonElement>('[data-bulk-image-pick]')!
const rows = () => Array.from(host!.querySelectorAll<HTMLElement>('[data-card-grid-item]'))

async function addFromManyImages() {
  await act(async () => { bulkButton().dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

describe('bulk add from the editor to the exported site', () => {
  it('shows every picked image in the exported page', async () => {
    await addFromManyImages()
    const out = html()
    for (const p of PICKED) expect(out).toContain(`src="${p.url}"`)
    expect(out).toContain('Blue Shoe')
    expect(out).toContain('Red Hat')
    expect(out).toContain('Fish &amp; Chips')
    expect(out).not.toContain('Fish & Chips')
  })

  it('undoes in one step back to the export from before the click', async () => {
    const before = html()
    await addFromManyImages()
    expect(html()).not.toBe(before)
    act(() => useConfigStore.getState().undo())
    expect(html()).toBe(before)
  })

  it('puts the new rows under Uncategorised, last, when grouping is on', async () => {
    const group = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent === 'Group by category')!
    act(() => { group.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await addFromManyImages()
    const headings = Array.from(host!.querySelectorAll('h4')).map((h) => h.textContent)
    expect(headings).toEqual(['Shoes', 'Uncategorised'])
    expect(rows()).toHaveLength(4)
  })

  it('leaves a valid site configuration', async () => {
    await addFromManyImages()
    const checked = validateSiteConfig(JSON.parse(JSON.stringify(config())))
    const items = checked.pages![0].blocks[0].props.items as Array<Record<string, unknown>>
    expect(items.map((i) => i.name)).toEqual(['Old Boot', 'Blue Shoe', 'Red Hat', 'Fish & Chips'])
  })
})
