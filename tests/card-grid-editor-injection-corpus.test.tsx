/**
 * Hostile text in every card grid item field, rendered in the items editor and
 * on the canvas.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CardGridItemsEditor } from '../src/editor/card-grid-items-editor/card-grid-items-editor'
import { CARD_GRID_ITEM_FIELDS } from '../src/editor/card-grid-items-editor/card-grid-item-fields'
import { RenderBlock } from '../src/blocks/registry'
import { useConfigStore } from '../src/store/configStore'
import type { BlockConfig } from '../src/blocks/types'
import { EDITOR_INJECTION_CORPUS } from './helpers/injection-corpus'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let host: HTMLElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  host?.remove()
  host = undefined
})

function blockWith(key: string, value: string): BlockConfig {
  return { id: 'cg-1', type: 'card-grid', variant: 'product', props: { items: [{ [key]: value }], display: 'grid' } }
}

function mountEditor(block: BlockConfig) {
  useConfigStore.getState().setConfig({
    name: 'X',
    pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [block] }],
    blocks: [block],
  })
  function Harness() {
    const b = useConfigStore((s) => s.config.pages![0].blocks[0])
    return <CardGridItemsEditor block={b} label="Products" />
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(<Harness />))
}

function assertInert(container: HTMLElement, checkAnchors: boolean) {
  expect(container.querySelectorAll('script')).toHaveLength(0)
  for (const el of container.querySelectorAll('*')) {
    for (const attr of Array.from(el.attributes)) expect(attr.name).not.toMatch(/^on/i)
  }
  expect(container.querySelectorAll('img[src^="javascript:"], img[src^="data:"]')).toHaveLength(0)
  if (checkAnchors) expect(container.querySelectorAll('a[href^="javascript:"]')).toHaveLength(0)
}

describe('items editor', () => {
  for (const { key } of CARD_GRID_ITEM_FIELDS) {
    it(`keeps hostile text inert and verbatim in ${key}`, () => {
      for (const payload of EDITOR_INJECTION_CORPUS) {
        mountEditor(blockWith(key, payload))
        assertInert(host!, true)
        const index = CARD_GRID_ITEM_FIELDS.findIndex((f) => f.key === key)
        expect(host!.querySelectorAll<HTMLInputElement>('[data-card-grid-item] input')[index].value).toBe(payload)
        act(() => root!.unmount())
        host!.remove()
      }
      root = undefined
      host = undefined
    })
  }

  it('round-trips a 10000 character value', () => {
    const long = 'x'.repeat(10000)
    mountEditor(blockWith('name', long))
    expect(host!.querySelectorAll<HTMLInputElement>('[data-card-grid-item] input')[2].value).toHaveLength(10000)
  })
})

describe('canvas', () => {
  for (const { key } of CARD_GRID_ITEM_FIELDS) {
    it(`renders hostile text inert in ${key}`, () => {
      for (const payload of EDITOR_INJECTION_CORPUS) {
        host = document.createElement('div')
        document.body.appendChild(host)
        root = createRoot(host)
        act(() => root!.render(<RenderBlock block={blockWith(key, payload)} />))
        assertInert(host, false)
        act(() => root!.unmount())
        host.remove()
      }
      root = undefined
      host = undefined
    })
  }
})
