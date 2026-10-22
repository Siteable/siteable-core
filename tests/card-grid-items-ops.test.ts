/**
 * Pure operations and view helpers of the card grid items editor.
 */
import { describe, it, expect } from 'vitest'
import { createCardGridItem } from '../src/editor/card-grid-items-editor/card-grid-item-fields'
import {
  addItem,
  duplicateItemAt,
  moveItemAt,
  removeItemAt,
  setItemFieldAt,
  toItemRows,
} from '../src/editor/card-grid-items-editor/card-grid-items-ops'
import { filterItemRows, groupItemRows } from '../src/editor/card-grid-items-editor/card-grid-items-view'
import { cardGridCategoryKey } from '../src/lib/export-behavior-runtime'
import { makeFiftyItems } from './helpers/card-grid-items-fixtures'

const KEYS = ['alt', 'category', 'ctaText', 'ctaUrl', 'description', 'image', 'name', 'price']

describe('new item template', () => {
  it('has all eight keys as empty strings for an empty list', () => {
    const [created] = addItem([]) as Array<Record<string, unknown>>
    expect(Object.keys(created).sort()).toEqual(KEYS)
    expect(Object.values(created).every((v) => v === '')).toBe(true)
  })

  it('has all eight keys when the first item is sparse', () => {
    expect(Object.keys(createCardGridItem({ name: 'A' })).sort()).toEqual(KEYS)
  })

  it('carries extra keys of the first item with their type', () => {
    const t = createCardGridItem({ sku: 'x1', tags: ['a'], stock: 5 })
    expect(t.sku).toBe('')
    expect(t.tags).toEqual([])
    expect(t.stock).toBe(5)
  })

  it('treats non-array input as an empty list', () => {
    expect(addItem(undefined)).toHaveLength(1)
    expect(addItem('x')).toHaveLength(1)
  })
})

describe('remove, move, duplicate, edit', () => {
  const a = { name: 'a' }
  const b = { name: 'b' }
  const c = { name: 'c' }

  it('removes by raw index and keeps identity of the rest', () => {
    const out = removeItemAt([a, b, c], 1)
    expect(out[0]).toBe(a)
    expect(out[1]).toBe(c)
    expect(out).toHaveLength(2)
  })

  it('moves up and down and ignores the bounds', () => {
    const list = [a, b, c]
    expect(moveItemAt(list, 1, -1)).toEqual([b, a, c])
    expect(moveItemAt(list, 1, 1)).toEqual([a, c, b])
    expect(moveItemAt(list, 0, -1)).toEqual(list)
    expect(moveItemAt(list, 2, 1)).toEqual(list)
    expect(moveItemAt(list, 1, 1)[1]).toBe(c)
  })

  it('swaps with the next plain object, skipping other entries in place', () => {
    const list = [a, 7, 'x', b]
    const out = moveItemAt(list, 0, 1)
    expect(out).toEqual([b, 7, 'x', a])
    expect(out[0]).toBe(b)
    expect(out[3]).toBe(a)
  })

  it('duplicates right after the source with a distinct copy', () => {
    const src = { name: 'a', image: 'u' }
    const list = [src, b]
    const out = duplicateItemAt(list, 0) as Array<Record<string, unknown>>
    expect(out).toHaveLength(3)
    expect(out[0]).toBe(src)
    expect(out[1]).toEqual(src)
    expect(out[1]).not.toBe(src)
    expect(out[2]).toBe(b)
  })

  it('does not duplicate a non-object entry', () => {
    const list = [1, a]
    expect(duplicateItemAt(list, 0)).toBe(list)
  })

  it('writes a string to an absent key and leaves other absent keys absent', () => {
    const src = { name: 'a' }
    const out = setItemFieldAt([src, b], 0, 'price', '9') as Array<Record<string, unknown>>
    expect(out[0]).toEqual({ name: 'a', price: '9' })
    expect('category' in out[0]).toBe(false)
    expect(out[1]).toBe(b)
    expect(src).toEqual({ name: 'a' })
  })
})

describe('rows', () => {
  it('lists plain objects with their raw index', () => {
    const o = { name: 'a' }
    const rows = toItemRows([1, o, null, [], { name: 'b' }])
    expect(rows.map((r) => r.rawIndex)).toEqual([1, 4])
    expect(rows[0].item).toBe(o)
  })

  it('is empty for non-arrays', () => {
    expect(toItemRows(undefined)).toEqual([])
    expect(toItemRows({})).toEqual([])
  })
})

describe('search', () => {
  const rows = toItemRows([
    { name: 'Red Shoe', description: 'fast', category: 'Footwear' },
    { name: 'Cap', description: 'Sun HAT', category: 'Head' },
    { name: 'Belt' },
  ])

  it('matches name, description and category case-insensitively', () => {
    expect(filterItemRows(rows, 'shoe').map((r) => r.rawIndex)).toEqual([0])
    expect(filterItemRows(rows, 'hat').map((r) => r.rawIndex)).toEqual([1])
    expect(filterItemRows(rows, 'FOOT').map((r) => r.rawIndex)).toEqual([0])
  })

  it('returns every row for a blank query, in order', () => {
    expect(filterItemRows(rows, '   ')).toBe(rows)
    expect(filterItemRows(rows, 'a').map((r) => r.rawIndex)).toEqual([0, 1])
  })
})

describe('grouping', () => {
  it('uses the export key rule over the 50-item fixture', () => {
    const items = makeFiftyItems()
    const stored = JSON.stringify(items)
    const groups = groupItemRows(toItemRows(items), items)
    expect(groups).toHaveLength(12)
    expect(groups.at(-1)).toMatchObject({ key: '', label: 'Uncategorised' })
    expect(groups.filter((g) => g.key === '')).toHaveLength(1)
    expect(groups[0].label).toBe('Shoes')
    for (const g of groups) {
      for (const r of g.rows) expect(cardGridCategoryKey(r.item.category)).toBe(g.key)
      const idx = g.rows.map((r) => r.rawIndex)
      expect(idx).toEqual([...idx].sort((x, y) => x - y))
    }
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(50)
    expect(JSON.stringify(items)).toBe(stored)
  })

  it('drops groups without visible rows', () => {
    const items = makeFiftyItems()
    const rows = filterItemRows(toItemRows(items), 'Cap')
    const groups = groupItemRows(rows, items)
    expect(groups.length).toBeLessThan(12)
    expect(groups.every((g) => g.rows.length > 0)).toBe(true)
  })
})
