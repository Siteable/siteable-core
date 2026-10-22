/**
 * The config store exposes a generation counter that changes only when the whole
 * configuration is replaced (setConfig, undo, redo). An edit that resolves later
 * (for example an asynchronous image pick) compares the counter to know whether
 * the configuration it started against is still the one in the store.
 *
 * The second half characterises object identity of list items: an unchanged item
 * keeps its identity when other rows are edited or moved, and loses it across
 * undo/redo (snapshots are cloned). A late write relies on both facts.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useConfigStore } from '../src/store/configStore'
import type { SiteConfig } from '../src/blocks/types'

type Item = { name: string; price: string }

const makeItems = (): Item[] => [
  { name: 'a', price: '1' },
  { name: 'b', price: '2' },
  { name: 'c', price: '3' },
]

function seedConfig(): SiteConfig {
  const blocks = [
    { id: 'grid-1', type: 'card-grid', variant: 'default', props: { title: 'T', items: makeItems() } },
    { id: 'other-1', type: 'footer', variant: 'simple', props: { logo: 'L' } },
  ]
  return {
    name: 'Test',
    pages: [{ id: 'page-home', name: 'Home', path: '/', blocks }],
    blocks,
  } as unknown as SiteConfig
}

const store = () => useConfigStore.getState()
const gen = () => store().configGeneration
const items = () =>
  store().config.pages![0].blocks.find((b) => b.id === 'grid-1')!.props.items as Item[]

beforeEach(() => {
  store().setConfig(seedConfig())
})

describe('configGeneration bump sites', () => {
  it('starts as a number and increases by exactly 1 on setConfig', () => {
    const before = gen()
    expect(typeof before).toBe('number')
    store().setConfig(seedConfig())
    expect(gen()).toBe(before + 1)
  })

  it('increases by exactly 1 on undo and on redo when a snapshot is applied', () => {
    store().updateBlockProps('grid-1', { title: 'changed' })
    const before = gen()
    store().undo()
    expect(gen()).toBe(before + 1)
    store().redo()
    expect(gen()).toBe(before + 2)
  })

  it('changes on a whole-config replacement that reuses the same block ids', () => {
    const before = gen()
    store().setConfig(seedConfig())
    expect(gen()).toBe(before + 1)
    expect(store().config.pages![0].blocks[0].id).toBe('grid-1')
  })

  it('does not change on an empty-stack undo or redo', () => {
    expect(store().undoStack.length).toBe(0)
    const before = gen()
    store().undo()
    store().redo()
    expect(gen()).toBe(before)
  })
})

describe('configGeneration is untouched by per-edit actions', () => {
  const actions: Array<[string, () => void]> = [
    ['setActivePage', () => store().setActivePage('page-home')],
    ['updateBlock', () => store().updateBlock('grid-1', { variant: 'x' })],
    ['updateBlockProps', () => store().updateBlockProps('grid-1', { title: 'n' })],
    [
      'addBlock',
      () => store().addBlock({ id: 'new-1', type: 'footer', variant: 'simple', props: {} } as never),
    ],
    ['removeBlock', () => store().removeBlock('other-1')],
    ['duplicateBlock', () => store().duplicateBlock('grid-1')],
    ['moveBlock', () => store().moveBlock(0, 1)],
    ['addPage', () => store().addPage('About', '/about')],
    ['renamePage', () => store().renamePage('page-home', 'Start')],
    ['setTheme', () => store().setTheme({ primaryColor: '#111111' } as never)],
    ['updateTheme', () => store().updateTheme({ primaryColor: '#222222' } as never)],
    ['previewTheme', () => store().previewTheme({ primaryColor: '#333333' } as never)],
  ]
  for (const [name, run] of actions) {
    it(`${name} leaves the generation unchanged`, () => {
      const before = gen()
      run()
      expect(gen()).toBe(before)
    })
  }

  it('removePage leaves the generation unchanged', () => {
    store().addPage('About', '/about')
    const before = gen()
    store().removePage(store().activePageId)
    expect(gen()).toBe(before)
  })
})

describe('configGeneration is in memory only', () => {
  it('is not part of the persisted payload', () => {
    store().updateBlockProps('grid-1', { title: 'persist me' })
    const raw = localStorage.getItem('openpage-config')
    expect(raw).not.toBeNull()
    const state = JSON.parse(raw!).state
    expect(Object.keys(state)).not.toContain('configGeneration')
  })
})

describe('list item identity', () => {
  it('keeps unchanged rows when one row is replaced through updateBlockProps', () => {
    const old = items()
    const next = [...old]
    next[1] = { ...old[1], name: 'x' }
    store().updateBlockProps('grid-1', { items: next })
    const now = items()
    expect(now[0]).toBe(old[0])
    expect(now[2]).toBe(old[2])
    expect(now[1]).not.toBe(old[1])
    expect(now[1].name).toBe('x')
  })

  it('keeps every row across unrelated edits', () => {
    const old = items()
    store().updateBlockProps('grid-1', { title: 'other title' })
    store().moveBlock(0, 1)
    store().addBlock({ id: 'new-2', type: 'footer', variant: 'simple', props: {} } as never)
    store().updateBlock('grid-1', { variant: 'compact' })
    const now = items()
    old.forEach((o, i) => expect(now[i]).toBe(o))
  })

  it('keeps each row object when the rows are reordered through a spread copy', () => {
    const [a, b, c] = items()
    store().updateBlockProps('grid-1', { items: [b, a, c] })
    const now = items()
    expect(now[0]).toBe(b)
    expect(now[1]).toBe(a)
    expect(now[2]).toBe(c)
  })

  it('replaces row objects across undo and redo while bumping the generation twice', () => {
    store().updateBlockProps('grid-1', { title: 'edited' })
    const old = items()
    const before = gen()
    store().undo()
    store().redo()
    expect(items()[0]).not.toBe(old[0])
    expect(items()[0]).toEqual(old[0])
    expect(gen()).toBe(before + 2)
  })

  it('records an undo entry but changes nothing for a missing block id', () => {
    const undoBefore = store().undoStack.length
    const configBefore = JSON.stringify(store().config)
    store().updateBlockProps('missing-id', { title: 'x' })
    expect(store().undoStack.length).toBe(undoBefore + 1)
    expect(JSON.stringify(store().config)).toBe(configBefore)
  })
})
