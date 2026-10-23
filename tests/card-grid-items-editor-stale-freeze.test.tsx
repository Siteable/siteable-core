/**
 * A row layout frozen while an input has focus must not come back after the list
 * grew and shrank again under the same focus.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CardGridItemsEditor } from '../src/editor/card-grid-items-editor/card-grid-items-editor'
import { useConfigStore } from '../src/store/configStore'
import type { BlockConfig } from '../src/blocks/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let host: HTMLElement | undefined

beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
  act(() => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
})

function Harness() {
  const block = useConfigStore((s) => s.config.pages![0].blocks[0])
  return <CardGridItemsEditor block={block} label="Products" />
}

const headings = () => Array.from(host!.querySelectorAll('h4')).map((h) => h.textContent)
const setItems = (items: Array<Record<string, unknown>>) =>
  act(() => useConfigStore.getState().updateBlockProps('cg-1', { items }))

describe('card grid items editor row freeze', () => {
  it('does not bring back an old layout after rows were appended and removed again', () => {
    // The first row is kept focused through the append; it only loses focus when its group changes.
    const block: BlockConfig = {
      id: 'cg-1',
      type: 'card-grid',
      variant: 'product',
      props: { items: [{ name: 'a', category: 'Hats' }, { name: 'b', category: 'Bags' }] },
    }
    useConfigStore.getState().setConfig({
      name: 'X',
      pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [block] }],
      blocks: [block],
    })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => root!.render(<Harness />))
    act(() => {
      Array.from(host!.querySelectorAll('button')).find((b) => b.textContent?.includes('Group by category'))!.click()
    })

    const input = host.querySelectorAll<HTMLElement>('[data-card-grid-item]')[0].querySelectorAll('input')[2]
    act(() => input.focus())
    expect(headings()).toEqual(['Hats', 'Bags'])

    // Rows are appended under the same focus: the new group shows at once.
    setItems([{ name: 'a', category: 'Hats' }, { name: 'b', category: 'Bags' }, { name: 'c', category: 'Cats' }])
    expect(headings()).toEqual(['Hats', 'Bags', 'Cats'])

    // They go away again and the first row moves group; the focus never left.
    setItems([{ name: 'a', category: 'Bags' }, { name: 'b', category: 'Bags' }])
    expect(headings()).toEqual(['Bags'])
  })
})
