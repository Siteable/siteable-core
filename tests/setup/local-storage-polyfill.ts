// ISS-003: Node >= 22 defines an experimental `globalThis.localStorage`
// accessor that returns `undefined` (and emits an ExperimentalWarning) unless
// `--localstorage-file` is passed. That accessor shadows the jsdom-provided
// localStorage inside vitest — even for files under `@vitest-environment
// jsdom` — so zustand's persist middleware captures `undefined` as its
// storage and the first store write throws
// "Cannot read properties of undefined (reading 'setItem')".
//
// This setup file rebinds `globalThis.localStorage` to an in-memory Storage
// before any store module is imported. Node's accessor is configurable, so a
// plain defineProperty replaces it. Registered via `test.setupFiles` in
// vite.config.ts, it applies to every vitest environment (node and jsdom).
class InMemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new InMemoryStorage(),
  configurable: true,
  writable: true,
})
