/**
 * Appending picked images to the stored card grid items.
 */
import { describe, it, expect } from 'vitest'
import { appendPickedItems, toItemRows } from '../src/editor/card-grid-items-editor/card-grid-items-ops'
import { groupItemRows } from '../src/editor/card-grid-items-editor/card-grid-items-view'
import { validateSiteConfig } from '../src/lib/generate-site'

const KEYS = ['alt', 'category', 'ctaText', 'ctaUrl', 'description', 'image', 'name', 'price']
const images = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ url: `https://x.test/${i}.jpg`, name: i % 2 ? `Item ${i}` : '' }))
type Row = Record<string, unknown>

describe('appendPickedItems', () => {
  it.each([
    ['missing', undefined],
    ['a string', 'x'],
    ['an object', {}],
    ['empty', []],
  ])('starts from an empty list when items is %s', (_l, items) => {
    expect(appendPickedItems(items, images(30))).toHaveLength(30)
  })

  it('appends after existing entries in order with eight string keys', () => {
    const existing = Array.from({ length: 500 }, (_, i) => ({ name: `e${i}` }))
    const next = appendPickedItems(existing, images(30)) as Row[]
    expect(next).toHaveLength(530)
    const added = next.slice(500)
    added.forEach((row, i) => {
      const img = images(30)[i]
      expect(Object.keys(row).sort()).toEqual(KEYS)
      expect(row.image).toBe(img.url)
      expect(row.name).toBe(img.name)
      expect(row.alt).toBe(img.name)
      for (const k of ['description', 'price', 'category', 'ctaText', 'ctaUrl']) expect(row[k]).toBe('')
    })
  })

  it('keeps every existing entry by reference, including non-objects', () => {
    const existing: unknown[] = ['junk', 7, { badge: 'b' }]
    const next = appendPickedItems(existing, images(2))
    existing.forEach((e, i) => expect(next[i]).toBe(e))
    expect((next[3] as Row).badge).toBe('')
  })

  it('carries nothing over when there is no plain object', () => {
    const next = appendPickedItems(['junk', 7], images(1)) as Row[]
    expect(Object.keys(next[2]).sort()).toEqual(KEYS)
  })

  it('does not alter prototypes and gives each row its own object', () => {
    const first = JSON.parse('{"__proto__":{"x":1},"meta":{"a":1},"tags":[1],"badge":"b"}')
    const next = appendPickedItems([first], images(3)) as Row[]
    const rows = next.slice(1)
    for (const r of rows) {
      expect(Object.getPrototypeOf(r)).toBe(Object.prototype)
      expect(r.x).toBeUndefined()
      expect(r.tags).toEqual([])
      expect(r.badge).toBe('')
    }
    expect(new Set(rows).size).toBe(3)
  })

  it('places new rows in the uncategorised group, last', () => {
    const existing = [{ name: 'a', category: 'Shoes' }]
    const next = appendPickedItems(existing, images(2))
    const groups = groupItemRows(toItemRows(next), next)
    const last = groups[groups.length - 1]
    expect(groups).toHaveLength(2)
    expect(groups[0].rows).toHaveLength(1)
    expect(last.rows).toHaveLength(2)
    expect(last.rows.map((row) => row.item.name)).toEqual(images(2).map((image) => image.name))
  })

  it('keeps a site config valid', () => {
    const next = appendPickedItems([], images(3))
    const config = {
      name: 'Shop',
      pages: [{ id: 'home', name: 'Home', path: '/', blocks: [{ id: 'g1', type: 'card-grid', variant: 'default', props: { items: next } }] }],
    }
    const block = validateSiteConfig(config, 'shop').pages![0].blocks[0]
    expect((block.props.items as unknown[])).toHaveLength(3)
  })
})
