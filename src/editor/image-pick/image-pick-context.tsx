/**
 * Holds the host-supplied image pick hook and one lock registry per editor
 * instance. The registry lives in provider state, so a pending pick survives the
 * properties panel unmounting and is never shared between two editors. Without a
 * provider, or without a hook, every consumer sees `enabled: false` and picks are
 * no-ops.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react'
import { createImagePickRegistry, type ImagePickRegistry, type PickLockKey } from './image-pick-registry'
import { captureFieldTarget, captureRowTarget } from './image-pick-target'
import { runImagePick } from './run-image-pick'
import { captureBulkTarget, runBulkImagePick, type BulkPickHook } from './run-bulk-image-pick'

type PickHook = () => Promise<string | null>

interface ImagePickContextValue {
  hookRef: RefObject<PickHook | undefined> | null
  bulkHookRef: RefObject<BulkPickHook | undefined> | null
  registry: ImagePickRegistry | null
  enabled: boolean
  bulkEnabled: boolean
  /** True until the provider unmounts; lets a late bulk result be dropped. */
  isAlive: (() => boolean) | null
}

const NO_HOOK: ImagePickContextValue = {
  hookRef: null,
  bulkHookRef: null,
  registry: null,
  enabled: false,
  bulkEnabled: false,
  isAlive: null,
}
const ImagePickContext = createContext<ImagePickContextValue>(NO_HOOK)

const noSubscribe = () => () => {}
const noVersion = () => 0

export function ImagePickProvider({
  onPickImage,
  onPickImages,
  children,
}: {
  onPickImage?: PickHook
  onPickImages?: BulkPickHook
  children: ReactNode
}) {
  // The host may pass a new function on every render; always call the latest one.
  const hookRef = useRef<PickHook | undefined>(onPickImage)
  hookRef.current = onPickImage
  const bulkHookRef = useRef<BulkPickHook | undefined>(onPickImages)
  bulkHookRef.current = onPickImages
  const [registry] = useState(() => createImagePickRegistry())
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])
  const [isAlive] = useState(() => () => aliveRef.current)
  // Single-pick controls depend on onPickImage only; bulk has its own flag.
  const enabled = typeof onPickImage === 'function'
  const bulkEnabled = typeof onPickImages === 'function'
  const [value, setValue] = useState<ImagePickContextValue>({
    hookRef, bulkHookRef, registry, enabled, bulkEnabled, isAlive,
  })
  if (value.enabled !== enabled || value.bulkEnabled !== bulkEnabled) {
    setValue({ hookRef, bulkHookRef, registry, enabled, bulkEnabled, isAlive })
  }
  return <ImagePickContext.Provider value={value}>{children}</ImagePickContext.Provider>
}

export interface UseImagePick {
  enabled: boolean
  bulkEnabled: boolean
  isPending: (key: PickLockKey) => boolean
  pickField: (blockId: string, fieldKey: string) => void
  pickRow: (blockId: string, listKey: string, item: object, subKey: string) => void
  pickImages: (blockId: string, listKey: string) => void
}

export function useImagePick(): UseImagePick {
  const { hookRef, bulkHookRef, registry, enabled, bulkEnabled, isAlive } = useContext(ImagePickContext)
  // Re-render whenever a lock is taken or released.
  useSyncExternalStore(registry?.subscribe ?? noSubscribe, registry?.getVersion ?? noVersion)

  const isPending = useCallback((key: PickLockKey) => registry?.has(key) ?? false, [registry])

  const pickField = useCallback(
    (blockId: string, fieldKey: string) => {
      const hook = hookRef?.current
      if (!enabled || !hook || !registry) return
      void runImagePick(hook, registry, captureFieldTarget(blockId, fieldKey))
    },
    [enabled, hookRef, registry],
  )

  const pickRow = useCallback(
    (blockId: string, listKey: string, item: object, subKey: string) => {
      const hook = hookRef?.current
      if (!enabled || !hook || !registry) return
      void runImagePick(hook, registry, captureRowTarget(blockId, listKey, item, subKey))
    },
    [enabled, hookRef, registry],
  )

  const pickImages = useCallback(
    (blockId: string, listKey: string) => {
      const hook = bulkHookRef?.current
      if (!bulkEnabled || !hook || !registry || !isAlive) return
      // The engine is built not to reject; the catch keeps a future throw from surfacing.
      void runBulkImagePick(hook, registry, captureBulkTarget(blockId, listKey), isAlive).catch(() => {})
    },
    [bulkEnabled, bulkHookRef, registry, isAlive],
  )

  return { enabled, bulkEnabled, isPending, pickField, pickRow, pickImages }
}
