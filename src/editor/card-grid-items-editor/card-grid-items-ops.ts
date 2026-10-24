/**
 * Pure list operations on the RAW stored `items` array. Entries that are not
 * plain objects stay where they are; untouched entries keep their identity.
 */
import { createCardGridItem } from './card-grid-item-fields'
import type { PickedImage } from '../image-pick/picked-image-entries'

export type ItemRecord = Record<string, unknown>
export interface ItemRow {
  item: ItemRecord
  rawIndex: number
}

export function isItemRecord(value: unknown): value is ItemRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const asList = (items: unknown): unknown[] => (Array.isArray(items) ? items : [])

/** One row per plain-object entry, carrying its index in the raw array. */
export function toItemRows(items: unknown): ItemRow[] {
  const rows: ItemRow[] = []
  asList(items).forEach((entry, rawIndex) => {
    if (isItemRecord(entry)) rows.push({ item: entry, rawIndex })
  })
  return rows
}

export function addItem(items: unknown): unknown[] {
  const list = asList(items)
  return [...list, createCardGridItem(list.find(isItemRecord))]
}

/**
 * Append one new product per picked image, in order. Each row gets its own
 * template (extra keys carried over from the first plain-object entry), with
 * the image url, and the name also used as alt text.
 */
export function appendPickedItems(items: unknown, images: readonly PickedImage[]): unknown[] {
  const list = asList(items)
  const first = list.find(isItemRecord)
  return [
    ...list,
    ...images.map(({ url, name }) => ({ ...createCardGridItem(first), image: url, name, alt: name })),
  ]
}

export function removeItemAt(items: unknown, index: number): unknown[] {
  return asList(items).filter((_, i) => i !== index)
}

/** Swap with the previous (-1) or next (+1) plain-object entry; no-op at a bound. */
export function moveItemAt(items: unknown, index: number, direction: -1 | 1): unknown[] {
  const list = asList(items)
  let target = index + direction
  while (target >= 0 && target < list.length && !isItemRecord(list[target])) target += direction
  if (target < 0 || target >= list.length || !isItemRecord(list[index])) return list
  const next = [...list]
  next[index] = list[target]
  next[target] = list[index]
  return next
}

/** Insert a shallow copy right after the source entry. */
export function duplicateItemAt(items: unknown, index: number): unknown[] {
  const list = asList(items)
  const source = list[index]
  if (!isItemRecord(source)) return list
  const next = [...list]
  next.splice(index + 1, 0, { ...source })
  return next
}

export function setItemFieldAt(items: unknown, index: number, key: string, value: string): unknown[] {
  const list = asList(items)
  const source = list[index]
  if (!isItemRecord(source)) return list
  const next = [...list]
  next[index] = { ...source, [key]: value }
  return next
}
