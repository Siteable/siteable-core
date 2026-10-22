import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent } from 'react'
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

/** One visible section of rows, as raw indexes; `key`/`label` are null when ungrouped. */
interface LayoutSection {
  key: string | null
  label: string | null
  indexes: number[]
}

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
  const reorderEnabled = !grouped && query.trim() === ''
  const positionOf = new Map(rows.map((r, n) => [r.rawIndex, n]))

  // While a text input in a row has focus the row layout (which rows are
  // visible and in which group) is frozen, so editing the category or the
  // searched text neither moves the row nor remounts the input. It is
  // recomputed as soon as focus leaves the rows.
  const computed: LayoutSection[] = grouped
    ? groupItemRows(shown, items).map((g) => ({ key: g.key, label: g.label, indexes: g.rows.map((r) => r.rawIndex) }))
    : [{ key: null, label: null, indexes: shown.map((r) => r.rawIndex) }]
  const generation = useConfigStore((s) => s.configGeneration)
  const [frozenState, setFrozen] = useState<{ sections: LayoutSection[]; generation: number } | null>(null)
  // A freeze from before a whole-configuration replacement, undo or redo is stale.
  const frozen = frozenState !== null && frozenState.generation === generation ? frozenState.sections : null
  const layout = frozen ?? computed
  const rowsRef = useRef<HTMLDivElement>(null)

  // Release the freeze if the focused input went away (unmounted or disabled),
  // since the browser fires no blur in that case.
  useEffect(() => {
    if (frozenState === null) return
    const active = document.activeElement
    if (!rowsRef.current || !active || !rowsRef.current.contains(active)) setFrozen(null)
  })
  const rowByIndex = new Map(rows.map((r) => [r.rawIndex, r]))

  const renderRow = (row: ItemRow) => {
    const position = positionOf.get(row.rawIndex) ?? -1
    return (
      <CardGridItemRow
        key={row.rawIndex}
        item={row.item}
        rawIndex={row.rawIndex}
        number={position + 1}
        canMoveUp={position > 0}
        canMoveDown={position >= 0 && position < rows.length - 1}
        reorderEnabled={reorderEnabled}
        actions={actions}
      />
    )
  }

  const renderSection = (section: LayoutSection) =>
    section.indexes.map((i) => rowByIndex.get(i)).filter((r): r is ItemRow => r !== undefined).map(renderRow)

  // Focus moving to another control inside the rows keeps the freeze.
  const onRowsBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFrozen(null)
  }

  const onRowsFocus = (e: FocusEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName
    if (frozen === null && (tag === 'INPUT' || tag === 'TEXTAREA')) setFrozen({ sections: computed, generation })
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
      <div ref={rowsRef} onFocus={onRowsFocus} onBlur={onRowsBlur}>
        {grouped
          ? layout.map((section) => (
              <section key={section.key} data-card-grid-group={section.key}>
                <h4 className="text-[10px] font-semibold text-text-2 mb-1">{section.label}</h4>
                {renderSection(section)}
              </section>
            ))
          : layout.map((section) => renderSection(section))}
      </div>
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
