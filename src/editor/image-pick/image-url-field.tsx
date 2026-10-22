import { useConfigStore } from '@/store/configStore'
import type { BlockConfig } from '@/blocks/types'
import { useImagePick } from './image-pick-context'
import { ImagePickButton } from './image-pick-button'
import { fieldLockKey } from './image-pick-target'

const INPUT_CLASS =
  'w-full px-2 py-1.5 rounded border border-border-default bg-bg-2 text-text-0 text-xs outline-none focus:border-green'

/**
 * Top-level image URL field. Without a host hook it is exactly the plain text field;
 * with one, a pick button sits beside the input and the field locks while a pick is
 * pending.
 */
export function ImageUrlField({
  block,
  fieldKey,
  label,
  value,
  onChange,
}: {
  block: BlockConfig
  fieldKey: string
  label: string
  value: unknown
  onChange(v: string): void
}) {
  const { enabled, isPending, pickField } = useImagePick()
  const generation = useConfigStore((s) => s.configGeneration)
  const pageId = useConfigStore((s) => s.activePageId)

  const input = (disabled: boolean) => (
    <input
      type="text"
      value={String(value || '')}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || undefined}
      className={INPUT_CLASS}
    />
  )

  if (!enabled) {
    return (
      <div className="mb-2.5">
        <label className="block text-[11.5px] text-text-2 mb-1 font-medium">{label}</label>
        {input(false)}
      </div>
    )
  }

  const pending = isPending(fieldLockKey(generation, pageId, block.id, fieldKey))
  return (
    <div className="mb-2.5">
      <label className="block text-[11.5px] text-text-2 mb-1 font-medium">{label}</label>
      <div className="flex items-center gap-1.5">
        {input(pending)}
        <ImagePickButton label={label} pending={pending} onClick={() => pickField(block.id, fieldKey)} />
      </div>
    </div>
  )
}
