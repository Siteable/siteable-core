/**
 * Runs one host-supplied image pick and maps what happens to exactly one outcome
 * and at most one notice. The returned URL is only ever stored as a string; it is
 * never fetched, executed or kept anywhere else.
 */
import { toast } from 'sonner'
import type { ImagePickRegistry } from './image-pick-registry'
import { lockKeyOf, writePickedImage, type PickTarget } from './image-pick-target'

export const IMAGE_PICK_FAILED_MESSAGE = 'Could not add the image. Please try again.'
export const IMAGE_PICK_DISCARDED_MESSAGE = 'The picked image was discarded because the content changed.'

export type ImagePickOutcome = 'refused' | 'dismissed' | 'failed' | 'written' | 'discarded'

export async function runImagePick(
  onPickImage: () => Promise<string | null> | string | null,
  registry: ImagePickRegistry,
  target: PickTarget,
): Promise<ImagePickOutcome> {
  const key = lockKeyOf(target)
  if (!registry.tryAcquire(key)) return 'refused'

  try {
    let result: unknown
    try {
      // Wrapping in a promise turns a synchronous throw into a rejection.
      result = await new Promise<unknown>((resolve) => resolve(onPickImage()))
    } catch {
      toast.error(IMAGE_PICK_FAILED_MESSAGE)
      return 'failed'
    }

    if (result === null) return 'dismissed'
    if (typeof result !== 'string') {
      toast.error(IMAGE_PICK_FAILED_MESSAGE)
      return 'failed'
    }

    const outcome = writePickedImage(target, result)
    if (outcome === 'discarded') toast(IMAGE_PICK_DISCARDED_MESSAGE)
    return outcome
  } finally {
    registry.release(key)
  }
}
