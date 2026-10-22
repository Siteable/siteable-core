/**
 * Tracks which image targets have a pick in flight. A key is either a string
 * (top-level field) or an object (a list row, matched by identity). The registry
 * is created per editor instance so two editors never share locks.
 */
export type PickLockKey = string | object

export interface ImagePickRegistry {
  /** Takes the lock; returns false when it is already held. */
  tryAcquire: (key: PickLockKey) => boolean
  release: (key: PickLockKey) => void
  has: (key: PickLockKey) => boolean
  /** Subscribe to lock changes (shape compatible with useSyncExternalStore). */
  subscribe: (listener: () => void) => () => void
  /** Changes on every acquire/release. */
  getVersion: () => number
}

export function createImagePickRegistry(): ImagePickRegistry {
  const held = new Set<PickLockKey>()
  const listeners = new Set<() => void>()
  let version = 0

  const changed = () => {
    version += 1
    listeners.forEach((listener) => listener())
  }

  return {
    tryAcquire(key) {
      if (held.has(key)) return false
      held.add(key)
      changed()
      return true
    },
    release(key) {
      if (held.delete(key)) changed()
    },
    has: (key) => held.has(key),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getVersion: () => version,
  }
}
