/**
 * The card-grid editor canvas.
 *
 * The canvas applies the same shaping, field order, URL policies and alt rule as
 * the export renderer, but it is a preview: every card is visible, no filter
 * control is rendered and no `data-sb-*` hook appears (the export runtime is not
 * loaded in the editor, so such a hook would be dead markup that invites
 * accidental behavior).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CardGridBlock } from '../src/blocks/card-grid/CardGridBlock'
import { RenderBlock } from '../src/blocks/registry'
import * as barrel from '../src/index'
import { FIXTURE_BLOCKS } from './helpers/behavior-fixtures'
import { isDisplayToken } from './helpers/behavior-test-table-filter'
import type { BlockConfig } from '../src/blocks/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let host: HTMLElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  host?.remove()
  host = undefined
})

function render(block: BlockConfig): HTMLElement {
  act(() => root?.unmount())
  host?.remove()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(<CardGridBlock block={block} />))
  return host
}

const cardGrid = (props: Record<string, unknown>, variant = 'product'): BlockConfig => ({
  id: 'cg-1',
  type: 'card-grid',
  variant,
  props,
})

const cardsIn = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('article'))

/** Display utilities on an element, using the filter observer's shared rule. */
const displayTokensOn = (element: Element): string[] =>
  Array.from(element.classList).filter(isDisplayToken)

describe('card grid canvas: card markup', () => {
  it('renders one card per item in the shared field order with the inline layout', () => {
    const host = render(
      cardGrid({
        title: 'Products',
        subtitle: 'Fresh picks',
        items: [
          {
            image: 'https://cdn.example.com/a.png',
            alt: 'A shoe',
            name: 'First',
            description: 'First description',
            price: '$10',
            category: 'Shoes',
            ctaText: 'Buy',
            ctaUrl: 'https://example.com/buy',
          },
          { name: 'Second' },
          { name: 'Third' },
        ],
      }),
    )

    expect(host.textContent).toContain('Products')
    expect(host.textContent).toContain('Fresh picks')
    const cards = cardsIn(host)
    expect(cards).toHaveLength(3)

    const [box, body] = Array.from(cards[0].children) as HTMLElement[]
    expect(box.style.aspectRatio).toBe('4 / 3')
    expect(box.style.overflow).toBe('hidden')

    const image = box.querySelector('img')
    expect(image).not.toBeNull()
    expect(image!.style.width).toBe('100%')
    expect(image!.style.height).toBe('100%')
    expect(image!.style.objectFit).toBe('cover')
    expect(image!.getAttribute('loading')).toBe('lazy')
    expect(image!.getAttribute('alt')).toBe('A shoe')

    // Category, name, description, price and the call to action, in order.
    expect(Array.from(body.children).map((child) => (child.textContent ?? '').trim())).toEqual([
      'Shoes',
      'First',
      'First description',
      '$10',
      'Buy',
    ])
    const link = body.querySelector('a')!
    expect(link.getAttribute('href')).toBe('https://example.com/buy')

    // The card itself carries no display utility; `hidden` must stay effective.
    for (const card of cards) {
      expect(displayTokensOn(card)).toEqual([])
    }
  })

  it('applies the alt rule and the image policy', () => {
    const host = render(
      cardGrid({
        items: [
          { image: 'https://cdn.example.com/a.png', alt: 'Explicit', name: 'One' },
          { image: 'https://cdn.example.com/b.png', name: 'Two' },
          { image: 'https://cdn.example.com/c.png', alt: '   ', name: ' Three ' },
          { image: 'https://cdn.example.com/d.png', alt: '   ', name: '   ' },
          { name: 'No image' },
          { image: 'http://cdn.example.com/e.png', name: 'Insecure' },
          { image: 'javascript:alert(1)', name: 'Hostile' },
        ],
      }),
    )

    const images = cardsIn(host).map((card) => card.querySelector('img'))
    expect(images[0]!.getAttribute('alt')).toBe('Explicit')
    expect(images[1]!.getAttribute('alt')).toBe('Two')
    expect(images[2]!.getAttribute('alt')).toBe(' Three ')
    expect(images[3]!.getAttribute('alt')).toBe('')
    // A missing, insecure or hostile image renders the placeholder instead.
    expect(images[4]).toBeNull()
    expect(images[5]).toBeNull()
    expect(images[6]).toBeNull()
    for (const index of [4, 5, 6]) {
      expect(cardsIn(host)[index].querySelector('svg')).not.toBeNull()
    }
  })

  it('renders a call to action only when text, URL and scheme all allow it', () => {
    const host = render(
      cardGrid({
        items: [
          { name: 'Valid', ctaText: 'Buy', ctaUrl: 'https://example.com/buy' },
          { name: 'Text only', ctaText: 'Buy' },
          { name: 'Url only', ctaUrl: 'https://example.com/buy' },
          { name: 'Hostile', ctaText: 'Buy', ctaUrl: 'javascript:alert(1)' },
          { name: 'Blank text', ctaText: '   ', ctaUrl: 'https://example.com/buy' },
        ],
      }),
    )

    const links = cardsIn(host).map((card) => card.querySelector('a'))
    expect(links[0]!.getAttribute('href')).toBe('https://example.com/buy')
    expect(links.slice(1)).toEqual([null, null, null, null])
  })

  it('renders hostile item text as text', () => {
    const payload = '<img src=x onerror=alert(1)>'
    const host = render(cardGrid({ items: [{ name: payload, description: payload }] }))

    const body = cardsIn(host)[0].children[1] as HTMLElement
    expect(body.querySelectorAll('img')).toHaveLength(0)
    expect(body.textContent).toContain(payload)
  })

  it('escapes markup, quotes, unicode and long values in text and attributes', () => {
    const payload = `<script>alert("x")</script> & 'quoted'`
    const long = 'a'.repeat(10_000)
    const host = render(
      cardGrid({
        items: [
          {
            image: 'https://cdn.example.com/a.png',
            alt: payload,
            name: payload,
            description: 'Ünïcode ✓ 🚀',
          },
          { name: long },
        ],
      }),
    )

    const cards = cardsIn(host)
    // The attribute value round-trips unchanged: React escaped the markup rather
    // than emitting it, and the parsed attribute reads back the original text.
    expect(cards[0].querySelector('img')!.getAttribute('alt')).toBe(payload)
    const body = cards[0].children[1] as HTMLElement
    expect(body.querySelector('script')).toBeNull()
    expect(body.textContent).toContain(payload)
    expect(body.textContent).toContain('Ünïcode ✓ 🚀')
    expect(cards[1].textContent).toContain(long)
    expect(host.querySelectorAll('script,img[src^="javascript"]')).toHaveLength(0)
  })

  it('renders an unknown variant exactly like product', () => {
    const items = [{ name: 'First' }, { name: 'Second' }]
    const unknown = cardsIn(render(cardGrid({ items }, 'anything-else'))).map((card) => card.textContent)
    const product = cardsIn(render(cardGrid({ items }))).map((card) => card.textContent)
    expect(product).toEqual(unknown)
  })

  it('is the component the registry renders for the card-grid type', () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() =>
      root!.render(
        <RenderBlock
          block={cardGrid({ items: [{ name: 'Registered card' }] })}
        />,
      ),
    )
    expect(cardsIn(host)).toHaveLength(1)
    expect(host.textContent).toContain('Registered card')
  })
})

describe('card grid canvas: filtering is export-only', () => {
  const FILTER_FIXTURES = [
    'card-grid-filter',
    'two-card-grids',
    'card-grids-shared-id',
    'card-grid-case-merge',
    'card-grid-many-categories',
  ] as const

  it.each(FILTER_FIXTURES)('shows every card and no filter control for %s', (fixture) => {
    // Non-vacuity: an emptied fixture must fail, not pass asserting nothing.
    expect(FIXTURE_BLOCKS[fixture].length).toBeGreaterThan(0)
    for (const block of FIXTURE_BLOCKS[fixture]) {
      const container = render(block)
      const items = (block.props.items as Array<{ name?: unknown }>).filter(
        (item) => typeof item === 'object' && item !== null,
      )

      expect(cardsIn(container)).toHaveLength(items.length)
      for (const item of items) {
        expect(container.textContent).toContain(String(item.name))
      }
      expect(cardsIn(container).every((card) => !card.hidden)).toBe(true)

      // No filter hook and no filter control at all, even with `display: filter`.
      expect(container.querySelectorAll('[data-sb-filter],[data-sb-filter-btn],[data-sb-category]')).toHaveLength(0)
      const buttons = Array.from(container.querySelectorAll('button'))
      const labels = ['All', 'Shoes', 'Hats', 'Bags']
      expect(buttons.filter((button) => labels.includes((button.textContent ?? '').trim()))).toEqual([])
    }
  })

  it('carries no data attribute hook anywhere in the canvas markup', () => {
    const container = render(FIXTURE_BLOCKS['card-grid-filter'][0])
    const attributes = Array.from(container.querySelectorAll('*')).flatMap((element) =>
      Array.from(element.attributes).map((attribute) => attribute.name),
    )
    expect(attributes.filter((name) => name.startsWith('data-sb-'))).toEqual([])
  })
})

describe('card grid canvas: empty state', () => {
  const UNUSABLE: Array<[string, unknown]> = [
    ['an empty array', []],
    ['an absent list', undefined],
    ['null', null],
    ['a plain object', {}],
    ['a string', 'x'],
    ['only non-object entries', ['x', 1, null, ['nested']]],
  ]

  it.each(UNUSABLE)('shows the empty state and does not throw for %s', (_label, items) => {
    const props: Record<string, unknown> = { title: 'Products' }
    if (items !== undefined) props.items = items
    let container: HTMLElement | undefined
    expect(() => {
      container = render(cardGrid(props))
    }).not.toThrow()

    expect(cardsIn(container!)).toHaveLength(0)
    expect(container!.textContent).toContain('No product cards yet')
  })

  it('drops the heading along with the cards', () => {
    const container = render(cardGrid({ title: 'Products', subtitle: 'Fresh picks', items: [] }))
    expect(container.querySelector('h2')).toBeNull()
  })
})

describe('card grid canvas: public surface', () => {
  it('is the same component the package barrel exports', () => {
    expect(barrel.CardGridBlock).toBe(CardGridBlock)
  })
})
