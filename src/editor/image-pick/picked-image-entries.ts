/**
 * Entry rules for the list of images a host returns from the bulk image pick
 * hook. Pure: no store, no toast, no network.
 */
import { isItemRecord } from '../card-grid-items-editor/card-grid-items-ops'

/** One image a host returns from the bulk pick hook. */
export interface PickedImageEntry {
  url: string
  name?: string
}

/** A validated entry: trimmed url, trimmed name or an empty string. */
export interface PickedImage {
  url: string
  name: string
}

/** Most images accepted from one pick; a longer raw list is rejected whole. */
export const MAX_PICKED_IMAGES = 100

export type PickedImagesRead =
  | { kind: 'dismissed' }
  | { kind: 'failed' }
  | { kind: 'images'; images: PickedImage[] }

/**
 * Decide what a raw hook result means. The cap applies to the raw length,
 * before any entry is validated. Only `url` and `name` are read, once each.
 */
export function readPickedImages(result: unknown): PickedImagesRead {
  if (result === null) return { kind: 'dismissed' }
  if (!Array.isArray(result)) return { kind: 'failed' }
  if (result.length === 0) return { kind: 'dismissed' }
  if (result.length > MAX_PICKED_IMAGES) return { kind: 'failed' }
  const images: PickedImage[] = []
  for (const entry of result) {
    if (!isItemRecord(entry)) continue
    const rawUrl = entry.url
    if (typeof rawUrl !== 'string') continue
    const url = rawUrl.trim()
    if (url === '') continue
    const rawName = entry.name
    images.push({ url, name: typeof rawName === 'string' ? rawName.trim() : '' })
  }
  return images.length === 0 ? { kind: 'failed' } : { kind: 'images', images }
}
