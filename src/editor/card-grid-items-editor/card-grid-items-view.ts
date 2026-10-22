/** View-only helpers: search and grouping never change the stored array. */
import { cardGridCategories, cardGridCategoryKey } from '@/lib/export-behavior-runtime'
import { UNCATEGORISED_LABEL } from './card-grid-item-fields'
import type { ItemRow } from './card-grid-items-ops'

export interface ItemGroup {
  key: string
  label: string
  rows: ItemRow[]
}

function lowered(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : ''
}

/** Rows whose name, description or category contains the query (case-insensitive). */
export function filterItemRows(rows: ItemRow[], query: string): ItemRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter(({ item }) =>
    [item.name, item.description, item.category].some((v) => lowered(v).includes(q)),
  )
}

/**
 * Group rows by the same key and label rule the exported filter uses. Group
 * order follows first appearance in `items`; the uncategorised group is last.
 * Groups with no rows in `rows` are dropped.
 */
export function groupItemRows(rows: ItemRow[], items: unknown): ItemGroup[] {
  const groups = cardGridCategories(items).map<ItemGroup>(({ key, label }) => ({ key, label, rows: [] }))
  groups.push({ key: '', label: UNCATEGORISED_LABEL, rows: [] })
  const byKey = new Map(groups.map((g) => [g.key, g]))
  for (const row of rows) {
    byKey.get(cardGridCategoryKey(row.item.category))?.rows.push(row)
  }
  return groups.filter((g) => g.rows.length > 0)
}
