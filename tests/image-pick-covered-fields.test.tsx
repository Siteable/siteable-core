/**
 * Which properties-panel fields show an image pick control, and what each one writes.
 * The covered list below is literal on purpose: a field added or dropped must be a
 * visible edit to this file.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PropertiesPanel } from '../src/editor/PropertiesPanel'
import { ImagePickProvider } from '../src/editor/image-pick/image-pick-context'
import { useConfigStore } from '../src/store/configStore'
import { blockMetadata } from '../src/lib/block-metadata'
import type { BlockConfig } from '../src/blocks/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PICKED = 'https://cdn.example/x.png'
const PICK_KEYS = ['src', 'image', 'avatar', 'photo']

let root: Root | undefined
let host: HTMLElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  host?.remove()
  host = undefined
})

function seed(block: BlockConfig) {
  useConfigStore.getState().setConfig({
    name: 'X',
    pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [block] }],
    blocks: [block],
  })
}

const storedProps = () => useConfigStore.getState().config.pages![0].blocks[0].props

function Harness() {
  const block = useConfigStore((s) => s.config.pages![0].blocks[0])
  return <PropertiesPanel block={block} />
}

type Hook = () => Promise<string | null>

/** `provider: false` mounts the panel with no provider at all. */
function mount(block: BlockConfig, hook?: Hook, provider = true) {
  seed(block)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() =>
    root!.render(provider ? <ImagePickProvider onPickImage={hook}><Harness /></ImagePickProvider> : <Harness />),
  )
}

const controls = () => Array.from(host!.querySelectorAll<HTMLButtonElement>('[data-image-pick]'))
const labelsOfControls = () => controls().map((c) => c.getAttribute('aria-label'))
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const resolved = (url: string | null): Hook => () => Promise.resolve(url)

async function pickWith(button: HTMLButtonElement) {
  await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

const blk = (type: string, props: Record<string, unknown>, variant = 'default'): BlockConfig =>
  ({ id: 'b-1', type, variant, props }) as BlockConfig

interface TopLevelCase { name: string; block: BlockConfig; key: string; label: string }
interface ListCase { name: string; block: BlockConfig; list: string; key: string; label: string }

const TOP_LEVEL: TopLevelCase[] = [
  { name: 'navbar logoImage', block: blk('navbar', { logoImage: '' }), key: 'logoImage', label: 'Logo Image URL' },
  { name: 'hero heroImage', block: blk('hero', { heroImage: '' }), key: 'heroImage', label: 'Hero Image URL' },
  { name: 'footer logoImage', block: blk('footer', { logoImage: '' }), key: 'logoImage', label: 'Logo Image URL' },
  { name: 'image src', block: blk('image', { src: '', images: [] }), key: 'src', label: 'Image URL' },
]

const row = (key: string) => ({ [key]: 'old', alt: 'a' })
const LIST: ListCase[] = [
  { name: 'image images[].src', block: blk('image', { src: 'keep', images: [row('src'), row('src')] }), list: 'images', key: 'src', label: 'Source' },
  { name: 'gallery images[].src', block: blk('gallery', { images: [row('src'), row('src')] }), list: 'images', key: 'src', label: 'Source' },
  { name: 'testimonials items[].avatar', block: blk('testimonials', { items: [row('avatar'), row('avatar')] }), list: 'items', key: 'avatar', label: 'avatar' },
  { name: 'team members[].avatar', block: blk('team', { members: [row('avatar'), row('avatar')] }), list: 'members', key: 'avatar', label: 'avatar' },
  { name: 'features items[].image', block: blk('features', { items: [row('image'), row('image')] }), list: 'items', key: 'image', label: 'Image URL' },
]

describe('top-level image fields', () => {
  it.each(TOP_LEVEL)('$name shows one control that writes to its own key', async (c) => {
    mount(c.block, resolved(PICKED))
    expect(labelsOfControls()).toEqual([`Choose image for ${c.label}`])
    await pickWith(controls()[0])
    expect(storedProps()[c.key]).toBe(PICKED)
  })
})

describe('list row image fields', () => {
  it.each(LIST)('$name shows a control per row and writes to the clicked row only', async (c) => {
    mount(c.block, resolved(PICKED))
    // The image block also has its own top-level source field; the rows are the last two controls.
    const rowControls = () => controls().slice(-2)
    expect(rowControls().map((b) => b.getAttribute('aria-label'))).toEqual([
      `Choose image for ${c.label}`,
      `Choose image for ${c.label}`,
    ])
    expect(controls()).toHaveLength(c.block.type === 'image' ? 3 : 2)
    await pickWith(rowControls()[1])
    const rows = storedProps()[c.list] as Array<Record<string, unknown>>
    expect(rows[0][c.key]).toBe('old')
    expect(rows[1][c.key]).toBe(PICKED)
    expect(rows[1].alt).toBe('a')
  })

  it('shows a control only on rows that carry the key', () => {
    mount(blk('testimonials', { items: [{ name: 'A', avatar: 'u' }, { name: 'B' }] }), resolved(PICKED))
    expect(controls()).toHaveLength(1)
  })

  it('treats a photo key as a picker key', async () => {
    mount(blk('team', { members: [{ name: 'A', photo: 'old' }] }), resolved(PICKED))
    expect(controls()).toHaveLength(1)
    await pickWith(controls()[0])
    expect((storedProps().members as Array<Record<string, unknown>>)[0].photo).toBe(PICKED)
  })

  it('gives a non-string picker value no control', () => {
    mount(blk('testimonials', { items: [{ name: 'A', avatar: 5 }] }), resolved(PICKED))
    expect(controls()).toHaveLength(0)
  })
})

describe('fields without an image', () => {
  const UNCOVERED: Array<[string, BlockConfig]> = [
    ['logocloud logos', blk('logocloud', { logos: ['A', 'B'] })],
    ['navbar links', blk('navbar', { logoImage: '', links: [{ label: 'a', href: '/' }] })],
    ['video url', blk('video', { url: 'https://example.com/v' })],
    ['banner link url', blk('banner', { text: 'x', linkUrl: 'https://example.com' })],
    ['testimonials row without avatar', blk('testimonials', { items: [{ name: 'A', quote: 'q' }] })],
    ['pricing tiers', blk('pricing', { tiers: [{ name: 'A', price: '1', features: [], cta: 'c', ctaUrl: '/' }] })],
    ['stats items', blk('stats', { items: [{ value: '1', label: 'a' }] })],
    ['faq items', blk('faq', { items: [{ question: 'q', answer: 'a' }] })],
  ]
  it.each(UNCOVERED)('%s shows no control', (_name, block) => {
    mount(block, resolved(PICKED))
    // navbar always has its logo control; every other case has none.
    const expected = block.type === 'navbar' ? 1 : 0
    expect(controls()).toHaveLength(expected)
  })
})

describe('every block type follows the key rule', () => {
  const TOP_LEVEL_KEYS: Record<string, number> = { navbar: 1, hero: 1, footer: 1, image: 1 }

  function expectedControls(type: string, props: Record<string, unknown>): number {
    let count = TOP_LEVEL_KEYS[type] ?? 0
    for (const [prop, value] of Object.entries(props)) {
      if (!Array.isArray(value)) continue
      // Navbar links and footer columns are link lists, not item lists.
      if (type === 'navbar' || type === 'footer') continue
      if (type === 'card-grid') { count += value.length; continue }
      for (const item of value) {
        if (!item || typeof item !== 'object') continue
        for (const [k, v] of Object.entries(item)) {
          if (PICK_KEYS.includes(k) && typeof v === 'string') count++
        }
      }
      void prop
    }
    return count
  }

  it.each(blockMetadata.map((m) => [m.type, m.defaultProps] as const))(
    '%s default content shows a control exactly where the rule says',
    (type, defaultProps) => {
      mount(blk(type, structuredClone(defaultProps)), resolved(PICKED))
      expect(controls()).toHaveLength(expectedControls(type, defaultProps))
    },
  )

  it('covers every block type with a picker-key row in default content', () => {
    const withRows = blockMetadata.filter((m) => expectedControls(m.type, m.defaultProps) > (TOP_LEVEL_KEYS[m.type] ?? 0))
    expect(withRows.length).toBeGreaterThan(0)
  })

  it.each(blockMetadata.map((m) => [m.type, m.defaultProps] as const))(
    '%s shows no control without a provider or without a hook',
    (type, defaultProps) => {
      mount(blk(type, structuredClone(defaultProps)), undefined, false)
      expect(controls()).toHaveLength(0)
      act(() => root?.unmount())
      host?.remove()
      mount(blk(type, structuredClone(defaultProps)), undefined, true)
      expect(controls()).toHaveLength(0)
    },
  )
})

describe('a generic row with a pending pick', () => {
  it('locks only that row and writes the result to it even after another row was edited', async () => {
    let release!: (v: string | null) => void
    const hook: Hook = () => new Promise((res) => { release = res })
    mount(blk('gallery', { images: [
      { src: 'one', alt: '1', caption: '' },
      { src: 'two', alt: '2', caption: '' },
      { src: 'three', alt: '3', caption: '' },
    ] }), hook)

    click(controls()[1])
    const rows = () => Array.from(host!.querySelectorAll<HTMLElement>('div.bg-bg-2'))
    const removeOf = (r: HTMLElement) => Array.from(r.querySelectorAll('button')).find((b) => b.textContent === 'Remove')!
    expect(rows()).toHaveLength(3)
    expect(rows()[1].querySelectorAll('input:disabled')).toHaveLength(3)
    expect(removeOf(rows()[1]).disabled).toBe(true)
    expect(rows()[0].querySelectorAll('input:disabled')).toHaveLength(0)
    expect(removeOf(rows()[0]).disabled).toBe(false)
    expect(rows()[2].querySelectorAll('input:disabled')).toHaveLength(0)

    const first = rows()[0].querySelector('input')!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(first, 'edited')
      first.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { release(PICKED) })

    const stored = storedProps().images as Array<Record<string, unknown>>
    expect(stored.map((r) => r.src)).toEqual(['edited', PICKED, 'three'])
    expect(rows()[1].querySelectorAll('input:disabled')).toHaveLength(0)
  })
})

describe('card grid products', () => {
  const items = [
    { image: 'a', name: 'A' },
    { image: 'b', name: 'B' },
  ]

  it('uses the items editor with one control per item', () => {
    mount(blk('card-grid', { title: 'T', items }, 'product'), resolved(PICKED))
    expect(host!.querySelectorAll('[data-card-grid-item]')).toHaveLength(2)
    expect(controls()).toHaveLength(2)
  })

  it('keeps one legacy row-class element per item without a hook', () => {
    mount(blk('card-grid', { title: 'T', items }, 'product'))
    expect(host!.querySelectorAll('div.bg-bg-2')).toHaveLength(host!.querySelectorAll('[data-card-grid-item]').length)
  })
})
