import { memo, useEffect, useId } from 'react'
import { ChevronDown, ChevronUp, Copy, Image as ImageIcon, X } from 'lucide-react'
import { isAllowedUrl } from '@/lib/url-policy'
import { ImagePickButton } from '../image-pick/image-pick-button'
import { useImagePick } from '../image-pick/image-pick-context'
import { CARD_GRID_ITEM_FIELDS } from './card-grid-item-fields'
import type { ItemRecord } from './card-grid-items-ops'

/** Stable callbacks shared by every row; they act on the latest stored list. */
export interface ItemRowActions {
  setField(rawIndex: number, key: string, value: string): void
  move(rawIndex: number, direction: -1 | 1): void
  duplicate(rawIndex: number): void
  remove(rawIndex: number): void
  /** Picks an image for the row's `image` field. */
  pick(item: ItemRecord): void
  /** Ends the frozen layout; called when the row locks for a pending pick. */
  releaseLayout(): void
}

const INPUT_CLASS =
  'w-full px-1.5 py-1 rounded border border-border-subtle bg-bg-3 text-text-0 text-[11px] outline-none focus:border-green disabled:opacity-60'
const ICON_BUTTON_CLASS =
  'p-0.5 text-text-3 hover:text-text-0 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

function displayValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(', ')
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function Thumbnail({ image }: { image: unknown }) {
  if (typeof image === 'string' && isAllowedUrl(image, { image: true })) {
    return (
      <img
        src={image}
        alt=""
        loading="lazy"
        decoding="async"
        width={32}
        height={32}
        className="w-8 h-8 rounded object-cover shrink-0"
      />
    )
  }
  return (
    <span className="w-8 h-8 rounded bg-bg-3 flex items-center justify-center shrink-0">
      <ImageIcon size={14} className="text-text-3" />
    </span>
  )
}

interface RowProps {
  item: ItemRecord
  rawIndex: number
  number: number
  canMoveUp: boolean
  canMoveDown: boolean
  reorderEnabled: boolean
  actions: ItemRowActions
}

function CardGridItemRowView({ item, rawIndex, number, canMoveUp, canMoveDown, reorderEnabled, actions }: RowProps) {
  const { enabled, isPending } = useImagePick()
  const pending = enabled && isPending(item)
  const idBase = useId()
  // A locked row disables its inputs, which can leave a stale frozen layout behind.
  useEffect(() => {
    if (pending) actions.releaseLayout()
  }, [pending, actions])

  return (
    <div
      data-card-grid-item=""
      aria-busy={pending || undefined}
      className="bg-bg-2 border border-border-default rounded p-2 mb-1.5"
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Thumbnail image={item.image} />
        <span className="text-[10px] text-text-3 font-medium flex-1">Item {number}</span>
        <button
          type="button"
          aria-label={`Move item ${number} up`}
          disabled={pending || !reorderEnabled || !canMoveUp}
          onClick={() => actions.move(rawIndex, -1)}
          className={ICON_BUTTON_CLASS}
        >
          <ChevronUp size={14} />
        </button>
        <button
          type="button"
          aria-label={`Move item ${number} down`}
          disabled={pending || !reorderEnabled || !canMoveDown}
          onClick={() => actions.move(rawIndex, 1)}
          className={ICON_BUTTON_CLASS}
        >
          <ChevronDown size={14} />
        </button>
        <button
          type="button"
          aria-label={`Duplicate item ${number}`}
          disabled={pending}
          onClick={() => actions.duplicate(rawIndex)}
          className={ICON_BUTTON_CLASS}
        >
          <Copy size={13} />
        </button>
        <button
          type="button"
          aria-label={`Remove item ${number}`}
          disabled={pending}
          onClick={() => actions.remove(rawIndex)}
          className={`${ICON_BUTTON_CLASS} hover:text-status-red`}
        >
          <X size={14} />
        </button>
      </div>
      {CARD_GRID_ITEM_FIELDS.map(({ key, label }) => {
        const value = item[key]
        const editable = value === undefined || value === null || typeof value === 'string'
        return (
          <div key={key} className="mb-1">
            <label htmlFor={`${idBase}-${key}`} className="block text-[10px] text-text-3 mb-0.5">{label}</label>
            <div className="flex items-center gap-1.5">
              <input
                id={`${idBase}-${key}`}
                type="text"
                value={displayValue(value)}
                onChange={(e) => editable && actions.setField(rawIndex, key, e.target.value)}
                readOnly={!editable}
                disabled={!editable || pending}
                title={editable ? undefined : 'Complex value — edit in the JSON panel'}
                className={INPUT_CLASS}
              />
              {key === 'image' && enabled && (
                <ImagePickButton
                  label={`item ${number}`}
                  pending={pending}
                  disabled={pending}
                  onClick={() => actions.pick(item)}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export const CardGridItemRow = memo(CardGridItemRowView)
