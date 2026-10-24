import { useConfigStore } from '@/store/configStore'
import { useImagePick } from '../image-pick/image-pick-context'
import { bulkLockKey } from '../image-pick/run-bulk-image-pick'

/**
 * Starts the host's many-images picker for one card grid block. Renders nothing
 * unless the host supplied the bulk hook; disabled while its pick is pending.
 */
export function CardGridBulkAddButton({ blockId, onBeforePick }: { blockId: string; onBeforePick(): void }) {
  const { bulkEnabled, isPending, pickImages } = useImagePick()
  const generation = useConfigStore((s) => s.configGeneration)
  const pageId = useConfigStore((s) => s.activePageId)
  if (!bulkEnabled) return null

  const pending = isPending(bulkLockKey(generation, pageId, blockId, 'items'))
  return (
    <button
      type="button"
      data-bulk-image-pick=""
      aria-busy={pending || undefined}
      disabled={pending}
      onClick={() => {
        onBeforePick()
        pickImages(blockId, 'items')
      }}
      className="ml-3 text-[10px] text-green hover:text-green-dim transition-colors disabled:opacity-50"
    >
      + Add from many images
    </button>
  )
}
