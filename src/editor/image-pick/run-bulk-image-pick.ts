/**
 * Runs one host-supplied bulk image pick: takes a per-block lock, calls the host
 * hook, and maps what happens to exactly one outcome and at most one notice. A
 * valid result appends card rows in a single undo step. URLs are only ever stored
 * as strings; they are never fetched, executed or kept anywhere else.
 */
import { toast } from 'sonner'
import { useConfigStore } from '@/store/configStore'
import { appendPickedItems } from '../card-grid-items-editor/card-grid-items-ops'
import type { ImagePickRegistry } from './image-pick-registry'
import { IMAGE_PICK_DISCARDED_MESSAGE, IMAGE_PICK_FAILED_MESSAGE, type ImagePickOutcome } from './run-image-pick'
import { readPickedImages, type PickedImage, type PickedImageEntry } from './picked-image-entries'

export type BulkPickHook = () => Promise<PickedImageEntry[] | null> | PickedImageEntry[] | null

export interface BulkPickTarget {
  generation: number
  pageId: string
  blockId: string
  listKey: string
}

/**
 * Lock key for one bulk pick. The parts are JSON-encoded so ids that contain a
 * colon cannot make two different targets share a key.
 */
export function bulkLockKey(generation: number, pageId: string, blockId: string, listKey: string): string {
  return 'bulk:' + JSON.stringify([generation, pageId, blockId, listKey])
}

export function captureBulkTarget(blockId: string, listKey: string): BulkPickTarget {
  const { configGeneration, activePageId } = useConfigStore.getState()
  return { generation: configGeneration, pageId: activePageId, blockId, listKey }
}

/**
 * Appends the images to the captured block if it is still there. The check and the
 * write happen in one synchronous step, and the list is read at this moment so
 * edits made while the host dialog was open are kept.
 */
function writePickedImages(target: BulkPickTarget, images: PickedImage[]): 'written' | 'discarded' {
  const state = useConfigStore.getState()
  if (state.configGeneration !== target.generation) return 'discarded'
  if (state.activePageId !== target.pageId) return 'discarded'

  const page = state.config.pages?.find((p) => p.id === target.pageId)
  const block = page?.blocks.find((b) => b.id === target.blockId)
  if (!block) return 'discarded'

  state.updateBlockProps(block.id, {
    [target.listKey]: appendPickedItems(block.props[target.listKey], images),
  })
  return 'written'
}

export async function runBulkImagePick(
  hook: BulkPickHook,
  registry: ImagePickRegistry,
  target: BulkPickTarget,
  isAlive: () => boolean,
): Promise<ImagePickOutcome> {
  const key = bulkLockKey(target.generation, target.pageId, target.blockId, target.listKey)
  if (!registry.tryAcquire(key)) return 'refused'

  try {
    // Wrapping in a promise turns a synchronous throw into a rejection.
    const raw = await new Promise<unknown>((resolve) => resolve(hook()))
    // The owning provider is gone: drop the result without a write or a notice.
    if (!isAlive()) return 'discarded'

    const read = readPickedImages(raw)
    if (read.kind === 'dismissed') return 'dismissed'
    if (read.kind === 'failed') {
      toast.error(IMAGE_PICK_FAILED_MESSAGE)
      return 'failed'
    }

    const outcome = writePickedImages(target, read.images)
    if (outcome === 'discarded') toast(IMAGE_PICK_DISCARDED_MESSAGE)
    return outcome
  } catch {
    // Any throw in the hook, the entry rules or the write ends up here.
    if (!isAlive()) return 'discarded'
    toast.error(IMAGE_PICK_FAILED_MESSAGE)
    return 'failed'
  } finally {
    registry.release(key)
  }
}
