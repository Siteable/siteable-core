import { createRoot } from 'react-dom/client'
import { CardGridItemsEditor } from '../../../src/editor/card-grid-items-editor/card-grid-items-editor'
import { ImagePickProvider } from '../../../src/editor/image-pick/image-pick-context'
import { useConfigStore } from '../../../src/store/configStore'
import type { BlockConfig } from '../../../src/blocks/types'
import { makeFiftyItems } from '../../helpers/card-grid-items-fixtures'

/**
 * Mounts the card grid items editor over 500 products with a bulk pick hook the
 * spec resolves by hand, so a run goes through the whole real path: button click,
 * pick engine, entry reading, append and one store write. It records when the
 * entries were handed over, when the store changed, how many times it changed and
 * when the result reached the screen.
 */
const ENTRY_COUNT = 30

const seedItems: Array<Record<string, unknown>> = []
for (let copy = 0; copy < 10; copy++) {
  for (const item of makeFiftyItems()) seedItems.push({ ...item, name: `${String(item.name)} (${copy})` })
}

const block: BlockConfig = { id: 'cg-1', type: 'card-grid', variant: 'product', props: { items: seedItems } }

useConfigStore.getState().setConfig({
  name: 'Timing',
  pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [block] }],
  blocks: [block],
})

const itemsNow = () => useConfigStore.getState().config.pages![0].blocks[0].props.items as unknown[]

interface Run { handedOver: number; storeMs: number | null; paintMs: number | null; notifications: number }
let run: Run = { handedOver: 0, storeMs: null, paintMs: null, notifications: 0 }
let snapshot: unknown[] = []
let release: ((entries: Array<{ url: string; name: string }>) => void) | null = null

useConfigStore.subscribe(() => {
  run.notifications += 1
  if (run.storeMs !== null || run.handedOver === 0) return
  run.storeMs = performance.now() - run.handedOver
  const start = run.handedOver
  requestAnimationFrame(() => requestAnimationFrame(() => { run.paintMs = performance.now() - start }))
})

const api = {
  /** Remembers the current list so the spec can compare entries by reference. */
  snapshot: () => { snapshot = [...itemsNow()] },
  /** Hands 30 valid entries to the pending pick. */
  resolve: () => {
    run = { handedOver: performance.now(), storeMs: null, paintMs: null, notifications: 0 }
    release?.(Array.from({ length: ENTRY_COUNT }, (_, n) => ({ url: `https://cdn.example.com/photo-${n + 1}.jpg`, name: `Photo ${n + 1}` })))
  },
  read: (): Run & { rows: number } => ({ ...run, rows: document.querySelectorAll('[data-card-grid-item]').length }),
  /** True when the first 500 entries are the very same objects as before. */
  sameFirst500: () => { const now = itemsNow(); return snapshot.length === 500 && snapshot.every((entry, i) => now[i] === entry) },
  /** Undoes the append; the undo notification is not counted in the next run. */
  undo: () => { useConfigStore.getState().undo(); run = { handedOver: 0, storeMs: null, paintMs: null, notifications: 0 } },
}
;(window as unknown as { __bulk: typeof api }).__bulk = api

const hook = () => new Promise<Array<{ url: string; name: string }>>((resolve) => { release = resolve })

function Harness() {
  const current = useConfigStore((s) => s.config.pages![0].blocks[0])
  return <CardGridItemsEditor block={current} label="Products" />
}

createRoot(document.getElementById('root')!).render(
  <ImagePickProvider onPickImages={hook}>
    <Harness />
  </ImagePickProvider>,
)
