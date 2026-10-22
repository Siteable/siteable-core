/**
 * A pick target records where a picked image will be written, together with the
 * configuration generation and page it was captured against. Writing re-checks all
 * of it, so a result that arrives after the content moved on is dropped instead of
 * landing on the wrong place.
 */
import { useConfigStore } from '@/store/configStore'
import type { PickLockKey } from './image-pick-registry'

export interface FieldPickTarget {
  kind: 'field'
  generation: number
  pageId: string
  blockId: string
  fieldKey: string
}

export interface RowPickTarget {
  kind: 'row'
  generation: number
  pageId: string
  blockId: string
  listKey: string
  /** The row object as it was when the pick started; matched by identity. */
  item: object
  subKey: string
}

export type PickTarget = FieldPickTarget | RowPickTarget

export function captureFieldTarget(blockId: string, fieldKey: string): FieldPickTarget {
  const { configGeneration, activePageId } = useConfigStore.getState()
  return { kind: 'field', generation: configGeneration, pageId: activePageId, blockId, fieldKey }
}

export function captureRowTarget(
  blockId: string,
  listKey: string,
  item: object,
  subKey: string,
): RowPickTarget {
  const { configGeneration, activePageId } = useConfigStore.getState()
  return { kind: 'row', generation: configGeneration, pageId: activePageId, blockId, listKey, item, subKey }
}

export function fieldLockKey(
  generation: number,
  pageId: string,
  blockId: string,
  fieldKey: string,
): string {
  return `field:${generation}:${pageId}:${blockId}:${fieldKey}`
}

export function lockKeyOf(target: PickTarget): PickLockKey {
  return target.kind === 'row'
    ? target.item
    : fieldLockKey(target.generation, target.pageId, target.blockId, target.fieldKey)
}

/**
 * Stores the URL on the captured target if it is still there. The check and the
 * write happen in one synchronous step, so nothing can change in between.
 */
export function writePickedImage(target: PickTarget, url: string): 'written' | 'discarded' {
  const state = useConfigStore.getState()
  if (state.configGeneration !== target.generation) return 'discarded'
  if (state.activePageId !== target.pageId) return 'discarded'

  const page = state.config.pages?.find((p) => p.id === target.pageId)
  const block = page?.blocks.find((b) => b.id === target.blockId)
  if (!block) return 'discarded'

  if (target.kind === 'field') {
    state.updateBlockProps(block.id, { [target.fieldKey]: url })
    return 'written'
  }

  const list = block.props[target.listKey]
  const index = Array.isArray(list) ? list.indexOf(target.item) : -1
  if (index < 0) return 'discarded'
  const next = [...(list as unknown[])]
  next[index] = { ...target.item, [target.subKey]: url }
  state.updateBlockProps(block.id, { [target.listKey]: next })
  return 'written'
}
