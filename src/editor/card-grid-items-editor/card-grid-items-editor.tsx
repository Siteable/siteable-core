import { useCallback, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useConfigStore } from '@/store/configStore'
import type { BlockConfig } from '@/blocks/types'
import { useImagePick } from '../image-pick/image-pick-context'
import { CardGridItemRow, type ItemRowActions } from './card-grid-item-row'
import {
  addItem,
  duplicateItemAt,
  moveItemAt,
  removeItemAt,
  setItemFieldAt,
  toItemRows,
  type ItemRow,
} from './card-grid-items-ops'
import { filterItemRows, groupItemRows } from './card-grid-items-view'

const LABEL_CLASS = 'block text-[11.5px] text-text-2 mb-1 font-medium'

/**
 * Dedicated items editor for the card grid block. Edits the raw stored array;
 * search and grouping only change what is shown.
 */
export function CardGridItemsEditor({ block, label }: { block: BlockConfig; label: string }) {
  const updateBlockProps = useConfigStore((s) => s.updateBlockProps)
  const { pickRow } = useImagePick()
  const items = block.props.items
  const [query, setQuery] = useState('')
  const [grouped, setGrouped] = useState(false)

  // Callbacks read the latest list through a ref so rows can stay memoised.
  const itemsRef = useRef<unknown>(items)
  itemsRef.current = items
  const blockId = block.id
  const write = useCallback(
    (next: unknown[]) => updateBlockProps(blockId, { items: next }),
    [updateBlockProps, blockId],
  )
  const actions = useMemo<ItemRowActions>(
    () => ({
      setField: (i, key, value) => write(setItemFieldAt(itemsRef.current, i, key, value)),
      move: (i, direction) => write(moveItemAt(itemsRef.current, i, direction)),
      duplicate: (i) => write(duplicateItemAt(itemsRef.current, i)),
      remove: (i) => write(removeItemAt(itemsRef.current, i)),
      pick: (item) => pickRow(blockId, 'items', item, 'image'),
    }),
    [write, pickRow, blockId],
  )

  const rows = toItemRows(items)
  const shown = filterItemRows(rows, query)
  const view = grouped ? groupItemRows(shown, items) : null
  const reorderEnabled = !grouped && query.trim() === ''
  const numberOf = new Map(rows.map((r, n) => [r.rawIndex, n + 1]))

  const renderRow = (row: ItemRow) => {
    const position = rows.indexOf(row)
    return (
      <CardGridItemRow
        key={row.rawIndex}
        item={row.item}
        rawIndex={row.rawIndex}
        number={numberOf.get(row.rawIndex) ?? 0}
        canMoveUp={position > 0}
        canMoveDown={position >= 0 && position < rows.length - 1}
        reorderEnabled={reorderEnabled}
        actions={actions}
      />
    )
  }

  return (
    <div className="mb-2.5">
      <label className={LABEL_CLASS}>{label}</label>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Search size={12} className="text-text-3 shrink-0" />
        <input
          type="search"
          aria-label="Search products"
          placeholder="Search products"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-1.5 py-1 rounded border border-border-subtle bg-bg-3 text-text-0 text-[11px] outline-none focus:border-green"
        />
        <button
          type="button"
          aria-pressed={grouped}
          onClick={() => setGrouped((g) => !g)}
          className={`shrink-0 text-[10px] px-1.5 py-1 rounded border ${
            grouped ? 'border-green text-green' : 'border-border-subtle text-text-2'
          }`}
        >
          Group by category
        </button>
      </div>
      {!reorderEnabled && (
        <p className="text-[10px] text-text-3 mb-1.5">Reorder is off while searching or grouping.</p>
      )}
      {rows.length === 0 && <p className="text-[11px] text-text-3 mb-1.5">No products yet.</p>}
      {view
        ? view.map((group) => (
            <section key={group.key} data-card-grid-group={group.key}>
              <h4 className="text-[10px] font-semibold text-text-2 mb-1">{group.label}</h4>
              {group.rows.map(renderRow)}
            </section>
          ))
        : shown.map(renderRow)}
      <button
        type="button"
        onClick={() => {
          setQuery('')
          write(addItem(itemsRef.current))
        }}
        className="text-[10px] text-green hover:text-green-dim transition-colors"
      >
        + Add item
      </button>
    </div>
  )
}
