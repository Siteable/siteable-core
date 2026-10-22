import { createRoot } from 'react-dom/client'
import { CardGridItemsEditor } from '../../../src/editor/card-grid-items-editor/card-grid-items-editor'
import { useConfigStore } from '../../../src/store/configStore'
import type { BlockConfig } from '../../../src/blocks/types'
import { makeFiftyItems } from '../../helpers/card-grid-items-fixtures'

/** Mounts the card grid items editor over 50 items, bound to the config store. */
const block: BlockConfig = {
  id: 'cg-1',
  type: 'card-grid',
  variant: 'product',
  props: { items: makeFiftyItems() },
}

useConfigStore.getState().setConfig({
  name: 'Timing',
  pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [block] }],
  blocks: [block],
})

function Harness() {
  const current = useConfigStore((s) => s.config.pages![0].blocks[0])
  return <CardGridItemsEditor block={current} label="Products" />
}

createRoot(document.getElementById('root')!).render(<Harness />)
