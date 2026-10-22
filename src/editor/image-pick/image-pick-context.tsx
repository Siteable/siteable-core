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
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react'
import { createImagePickRegistry, type ImagePickRegistry, type PickLockKey } from './image-pick-registry'
import { captureFieldTarget, captureRowTarget } from './image-pick-target'
import { runImagePick } from './run-image-pick'

type PickHook = () => Promise<string | null>

interface ImagePickContextValue {
  hookRef: RefObject<PickHook | undefined> | null
  registry: ImagePickRegistry | null
  enabled: boolean
}

const NO_HOOK: ImagePickContextValue = { hookRef: null, registry: null, enabled: false }
const ImagePickContext = createContext<ImagePickContextValue>(NO_HOOK)

const noSubscribe = () => () => {}
const noVersion = () => 0

export function ImagePickProvider({
  onPickImage,
  children,
}: {
  onPickImage?: PickHook
  children: ReactNode
}) {
  // The host may pass a new function on every render; always call the latest one.
  const hookRef = useRef<PickHook | undefined>(onPickImage)
  hookRef.current = onPickImage
  const [registry] = useState(() => createImagePickRegistry())
  const enabled = typeof onPickImage === 'function'
  const [value, setValue] = useState<ImagePickContextValue>({ hookRef, registry, enabled })
  if (value.enabled !== enabled) setValue({ hookRef, registry, enabled })
  return <ImagePickContext.Provider value={value}>{children}</ImagePickContext.Provider>
}

export interface UseImagePick {
  enabled: boolean
  isPending: (key: PickLockKey) => boolean
  pickField: (blockId: string, fieldKey: string) => void
  pickRow: (blockId: string, listKey: string, item: object, subKey: string) => void
}

export function useImagePick(): UseImagePick {
  const { hookRef, registry, enabled } = useContext(ImagePickContext)
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

  return { enabled, isPending, pickField, pickRow }
}
