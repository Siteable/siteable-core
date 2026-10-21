/**
 * Card grid export markup — cards, the optional filter, and per-page emission.
 *
 * The suite asserts the CONTRACT of the exported document, not the runtime: one
 * card per item object in item order, the fixed field order, the inline image
 * box that survives with scripts disabled, the URL policies, the alt fallback,
 * and the filter container with its buttons and keys. It also proves that a
 * block with no product items emits nothing at all and that a page with no
 * filter grid gains neither the shared script nor the filter rules.
 *
 * Every assertion reads a document produced by `exportSiteToHTML` (or
 * `renderCardGrid` directly for the empty-input cases), so a divergence between
 * the renderer and the page emission cannot pass.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { exportSiteToHTML } from '../src/lib/export-html'
import { exportSitePages } from '../src/lib/export-site-pages'
import { renderCardGrid } from '../src/lib/export-blocks/render-card-grid'
import { toCardGridItems } from '../src/lib/card-grid-items'
import { BEHAVIOR_NOSCRIPT_CSS } from '../src/lib/export-behavior-runtime'
import { noScriptText } from './helpers/tab-set-allowed-diff'
import type { BlockConfig, SiteConfig } from '../src/blocks/types'

const BOX_STYLE = 'aspect-ratio:4/3;overflow:hidden'
const IMAGE_STYLE = 'width:100%;height:100%;object-fit:cover'
const FILTER_RULE = '[data-sb-filter-btn]{display:none!important}'

/** Tailwind display utilities: the ones that would defeat the `hidden` attribute. */
const DISPLAY_TOKENS = ['block', 'flex', 'grid', 'inline', 'inline-block', 'inline-flex', 'hidden']

const parse = (doc: string): Document => new DOMParser().parseFromString(doc, 'text/html')

const countScripts = (html: string): number => (html.match(/<script/gi) ?? []).length

/** An `on*=` handler attribute on a parsed element (escaped text is inert). */
function injectedHandlers(html: string): string[] {
  const found: string[] = []
  for (const element of parse(html).querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name)) found.push(`${element.tagName}.${attribute.name}=${attribute.value}`)
    }
  }
  return found
}

/** Class tokens whose last colon-separated segment is a display utility. */
function displayTokens(element: Element): string[] {
  return (element.getAttribute('class') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => DISPLAY_TOKENS.includes(token.split(':').pop() ?? ''))
}

function cardGrid(props: Record<string, unknown>, overrides: Partial<BlockConfig> = {}): BlockConfig {
  return { id: 'cards-1', type: 'card-grid', variant: 'product', props, ...overrides }
}

function page(...blocks: BlockConfig[]): string {
  return exportSiteToHTML({ name: 'Site', blocks })
}

function rendered(props: Record<string, unknown>): string {
  return page(cardGrid(props))
}

function docOf(props: Record<string, unknown>): Document {
  return parse(rendered({ items: [], ...props }))
}

const COMPLETE_ITEMS = [
  {
    image: 'https://cdn.example.com/shoe.png',
    alt: 'A running shoe',
    name: 'Shoe one',
    description: 'A first product',
    price: '$10',
    category: 'Running',
    ctaText: 'View',
    ctaUrl: 'https://example.com/item-1',
  },
  {
    image: 'https://cdn.example.com/bag.png',
    alt: 'A day bag',
    name: 'Bag two',
    description: 'A second product',
    price: '$20',
    category: 'Bags',
    ctaText: 'View',
    ctaUrl: 'https://example.com/item-2',
  },
  {
    image: 'https://cdn.example.com/cap.png',
    alt: 'A plain cap',
    name: 'Cap three',
    description: 'A third product',
    price: '$30',
    category: 'Running',
    ctaText: 'View',
    ctaUrl: 'https://example.com/item-3',
  },
]

const FILTER_ITEMS = [
  ...COMPLETE_ITEMS,
  { name: 'No category', description: 'Uncategorised', price: '$40', category: '' },
]

describe('card markup', () => {
  it('renders one card per item object, in item order', () => {
    const doc = docOf({ items: COMPLETE_ITEMS })
    const cards = [...doc.querySelectorAll('article')]
    expect(cards).toHaveLength(3)
    expect(cards.map((card) => card.querySelector('h3')?.textContent)).toEqual([
      'Shoe one',
      'Bag two',
      'Cap three',
    ])
  })

  it('puts the box, then category, name, description, price and call to action in order', () => {
    const doc = docOf({ items: [COMPLETE_ITEMS[0]] })
    const card = doc.querySelector('article') as Element
    const box = card.children[0]
    const content = card.children[1]

    expect(box.getAttribute('style')).toContain(BOX_STYLE)
    expect([...content.children].map((child) => child.tagName)).toEqual([
      'DIV',
      'H3',
      'P',
      'DIV',
      'A',
    ])
    expect([...content.children].map((child) => child.textContent)).toEqual([
      'Running',
      'Shoe one',
      'A first product',
      '$10',
      'View',
    ])
  })

  it('gives the image box the inline ratio, the image inline cover fit and lazy loading', () => {
    const doc = docOf({ items: [COMPLETE_ITEMS[0]] })
    const img = doc.querySelector('article img') as Element
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/shoe.png')
    expect(img.getAttribute('style')).toBe(IMAGE_STYLE)
    expect(img.getAttribute('loading')).toBe('lazy')
  })

  it('carries no display utility on the card element itself', () => {
    const doc = docOf({ items: COMPLETE_ITEMS })
    for (const card of doc.querySelectorAll('article')) {
      expect(displayTokens(card), `card class: ${card.getAttribute('class')}`).toEqual([])
    }
  })

  it('treats whitespace-only text as absent for every displayed field', () => {
    const doc = parse(
      rendered({
        items: [
          {
            image: 'https://cdn.example.com/shoe.png',
            alt: 'A shoe',
            name: '   ',
            description: ' ',
            price: '\t',
            category: '  ',
            ctaText: '  ',
            ctaUrl: 'https://example.com/x',
          },
        ],
      }),
    )
    const card = doc.querySelector('article') as Element
    expect(card.children[1].children).toHaveLength(0)
    expect(card.querySelector('h3')).toBeNull()
    expect(card.querySelector('p')).toBeNull()
    expect(card.querySelector('a')).toBeNull()
  })

  it('renders an unknown variant exactly like the product variant', () => {
    const props = { title: 'Shoes', items: COMPLETE_ITEMS, display: 'filter' }
    const product = renderCardGrid(cardGrid(props))
    const unknown = renderCardGrid(cardGrid(props, { variant: 'mystery' }))
    expect(unknown).toBe(product)
  })

  describe('call to action', () => {
    const ctaOf = (item: Record<string, unknown>): Element | null =>
      parse(rendered({ items: [{ ...COMPLETE_ITEMS[0], ...item }] })).querySelector('article a')

    it('renders the anchor only when text, URL and policy all pass', () => {
      expect(ctaOf({ ctaText: 'View', ctaUrl: 'https://example.com/x' })?.getAttribute('href')).toBe(
        'https://example.com/x',
      )
    })

    it('omits the anchor when only the text is present', () => {
      expect(ctaOf({ ctaText: 'View', ctaUrl: '' })).toBeNull()
    })

    it('omits the anchor when only the URL is present', () => {
      expect(ctaOf({ ctaText: '', ctaUrl: 'https://example.com/x' })).toBeNull()
    })

    it('omits the anchor for a rejected scheme', () => {
      expect(ctaOf({ ctaText: 'View', ctaUrl: 'javascript:alert(1)' })).toBeNull()
    })

    it('omits the anchor when the text is whitespace only', () => {
      expect(ctaOf({ ctaText: '   ', ctaUrl: 'https://example.com/x' })).toBeNull()
    })
  })

  describe('image and placeholder', () => {
    const imageOf = (item: Record<string, unknown>): { img: Element | null; card: Element } => {
      const card = parse(rendered({ items: [{ ...COMPLETE_ITEMS[0], ...item }] })).querySelector('article') as Element
      return { img: card.querySelector('img'), card }
    }

    it('renders the placeholder when the item has no image', () => {
      const { img, card } = imageOf({ image: '' })
      expect(img).toBeNull()
      expect(card.children[0].innerHTML).toContain('from-bg-3')
    })

    it('renders the placeholder for a non-https image', () => {
      const { img, card } = imageOf({ image: 'http://cdn.example.com/shoe.png' })
      expect(img).toBeNull()
      expect(card.children[0].innerHTML).toContain('from-bg-3')
    })

    it('renders an https image', () => {
      const { img } = imageOf({ image: 'https://cdn.example.com/shoe.png' })
      expect(img?.getAttribute('src')).toBe('https://cdn.example.com/shoe.png')
    })

    it.each([
      [{ alt: 'A shoe', name: 'Shoe' }, 'A shoe'],
      [{ name: 'Shoe' }, 'Shoe'],
      [{ alt: '', name: 'Shoe' }, 'Shoe'],
      [{ alt: '   ', name: 'Shoe' }, 'Shoe'],
      [{ alt: 'A shoe', name: '' }, 'A shoe'],
      [{ name: '   ' }, ''],
      [{}, ''],
    ])('alt for %j is %j — always present', (fields, expected) => {
      const doc = parse(
        rendered({ items: [{ image: 'https://cdn.example.com/shoe.png', ...fields }] }),
      )
      const img = doc.querySelector('article img')
      expect(img).not.toBeNull()
      expect(img?.hasAttribute('alt')).toBe(true)
      expect(img?.getAttribute('alt')).toBe(expected)
    })
  })

  describe('escaping', () => {
    const PAYLOADS = [
      '<script>alert(1)</script>',
      '"><img src=x onerror=alert(1)>',
      "'><svg/onload=alert(1)>",
      'javascript:alert(1)',
      '&#106;avascript:alert(1)',
      'Ünïcode — 产品',
      'x'.repeat(10000),
    ]

    const TEXTS = ['title', 'subtitle', 'name', 'description', 'price', 'category', 'alt', 'ctaText']

    it('escapes hostile text in every displayed field and injects no markup', () => {
      const clean = rendered({ items: [COMPLETE_ITEMS[0]] })
      for (const payload of PAYLOADS) {
        for (const field of TEXTS) {
          const html = rendered({
            title: field === 'title' ? payload : 'Title',
            subtitle: field === 'subtitle' ? payload : 'Sub',
            items: [{ ...COMPLETE_ITEMS[0], [field]: payload }],
          })
          const msg = `${field} ← ${JSON.stringify(payload.slice(0, 24))}`
          expect(injectedHandlers(html), `${msg}: injected handler`).toEqual([])
          expect(countScripts(html), `${msg}: injected script`).toBe(countScripts(clean))
          if (payload.includes('<')) expect(html, `${msg}: raw payload`).not.toContain(payload)
        }
      }
    })

    it('escapes a hostile category into a key that needs no attribute escaping', () => {
      const doc = parse(
        rendered({
          display: 'filter',
          items: [
            { name: 'One', category: 'a&b"c' },
            { name: 'Two', category: '<tag>' },
          ],
        }),
      )
      const keys = [
        ...[...doc.querySelectorAll('[data-sb-filter-btn]')].map((el) =>
          el.getAttribute('data-sb-filter-btn'),
        ),
        ...[...doc.querySelectorAll('[data-sb-category]')].map((el) =>
          el.getAttribute('data-sb-category'),
        ),
      ]
      for (const key of keys) expect(key ?? '').toMatch(/^[^&<>"'`]*$/)
      expect(keys).toContain('a%26b%22c')
    })
  })
})

describe('filter markup', () => {
  it('wraps the button row and the grid in one filter container', () => {
    const doc = docOf({ display: 'filter', items: FILTER_ITEMS })
    const container = doc.querySelector('[data-sb-filter]') as Element
    expect(container).not.toBeNull()
    expect(container.querySelectorAll('button').length).toBe(3)
    expect(container.querySelectorAll('article').length).toBe(4)
  })

  it('puts an active All button first, then one button per category in first-seen order', () => {
    const doc = docOf({ display: 'filter', items: FILTER_ITEMS })
    const buttons = [...doc.querySelectorAll('[data-sb-filter-btn]')]

    expect(buttons.map((b) => b.textContent)).toEqual(['All', 'Running', 'Bags'])
    expect(buttons.map((b) => b.getAttribute('data-sb-filter-btn'))).toEqual(['', 'running', 'bags'])
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
  })

  it('gives every card the matching key, empty for the uncategorised one', () => {
    const doc = docOf({ display: 'filter', items: FILTER_ITEMS })
    expect([...doc.querySelectorAll('[data-sb-category]')].map((el) => el.getAttribute('data-sb-category'))).toEqual([
      'running',
      'bags',
      'running',
      '',
    ])
  })

  it('trims the first-seen label while keeping its spelling and order', () => {
    const doc = docOf({
      display: 'filter',
      items: [{ category: '  Running  ' }, { category: 'Bags' }],
    })
    expect([...doc.querySelectorAll('[data-sb-filter-btn]')].map((button) => button.textContent)).toEqual([
      'All',
      'Running',
      'Bags',
    ])
    expect(
      [...doc.querySelectorAll('[data-sb-category]')].map((el) => el.getAttribute('data-sb-category')),
    ).toEqual(['running', 'bags'])
  })

  it('keeps the wrapping row on the button row and sizes every button', () => {
    const doc = docOf({ display: 'filter', items: FILTER_ITEMS })
    const row = doc.querySelector('[data-sb-filter] > div') as Element
    expect(row.getAttribute('class')).toContain('flex flex-wrap gap-2')

    for (const button of doc.querySelectorAll('[data-sb-filter-btn]')) {
      const classes = button.getAttribute('class') ?? ''
      expect(classes, `button class: ${classes}`).toContain('min-h-[32px]')
      expect(classes, `button class: ${classes}`).toContain('min-w-[32px]')
      // Layout must not beat the hidden state nor the no-script rule.
      expect(displayTokens(button), `button class: ${classes}`).toEqual([])
      expect(button.getAttribute('type')).toBe('button')
    }
  })

  it('renders a plain grid with none of the filter hooks', () => {
    const html = rendered({ items: FILTER_ITEMS })
    const doc = parse(html)
    expect(html).not.toContain('data-sb-filter')
    expect(html).not.toContain('data-sb-category')
    expect(doc.querySelectorAll('article').length).toBe(4)
  })

  it.each([
    ['one distinct category', { display: 'filter', items: [{ category: 'Shoes' }, { category: 'shoes ' }] }],
    ['a whitespace-only second category', { display: 'filter', items: [{ category: 'Shoes' }, { category: '   ' }] }],
    ['an unknown display value', { display: 'Filter', items: [{ category: 'Shoes' }, { category: 'Bags' }] }],
    ['no display value', { items: [{ category: 'Shoes' }, { category: 'Bags' }] }],
  ])('renders a plain grid for %s', (_label, props) => {
    const html = rendered(props)
    expect(html).not.toContain('data-sb-filter')
    expect(html).not.toContain('data-sb-filter-btn')
    expect(html).not.toContain('data-sb-category')
  })
})

describe('per-page emission', () => {
  it('emits exactly one runtime script and the filter rule on a filtered page', () => {
    const plain = rendered({ items: COMPLETE_ITEMS })
    const html = rendered({ display: 'filter', items: FILTER_ITEMS })
    expect(html.match(/<script data-sb-runtime>/g) ?? []).toHaveLength(1)
    expect(countScripts(html)).toBe(countScripts(plain) + 1)
    expect(noScriptText(html)).toBe(FILTER_RULE)
  })

  it('adds no script and no no-script block to a page with only plain grids', () => {
    const html = rendered({ items: COMPLETE_ITEMS })
    expect(html).not.toContain('<script data-sb-runtime')
    expect(html).not.toContain('<noscript>')
  })

  it('adds only the shipped menu and faq rules on a navbar page with a plain grid', () => {
    const html = page(
      { id: 'nav-1', type: 'navbar', variant: 'default', props: { logo: 'Acme', links: [] } },
      cardGrid({ items: COMPLETE_ITEMS }),
    )
    expect(html.match(/<script data-sb-runtime>/g) ?? []).toHaveLength(1)
    expect(noScriptText(html)).toBe(BEHAVIOR_NOSCRIPT_CSS)
    expect(noScriptText(html)).not.toContain('data-sb-filter-btn')
  })

  it('emits the script and the rule only on the page that carries the filter grid', () => {
    const config: SiteConfig = {
      name: 'Two pages',
      blocks: [],
      pages: [
        { id: 'p1', name: 'One', path: '/', blocks: [cardGrid({ display: 'filter', items: FILTER_ITEMS })] },
        { id: 'p2', name: 'Two', path: '/two', blocks: [cardGrid({ items: COMPLETE_ITEMS })] },
      ],
    }
    const pages = exportSitePages(config)
    expect(pages).toHaveLength(2)
    expect(pages[0].html.match(/<script data-sb-runtime>/g) ?? []).toHaveLength(1)
    expect(noScriptText(pages[0].html)).toBe(FILTER_RULE)
    expect(pages[1].html).not.toContain('<script data-sb-runtime')
    expect(pages[1].html).not.toContain('<noscript>')
    expect(pages[1].html).not.toContain('data-sb-filter')
  })
})

describe('empty and malformed items', () => {
  const BAD_ITEMS: Array<[string, unknown]> = [
    ['an empty array', []],
    ['an absent list', undefined],
    ['null', null],
    ['an object', {}],
    ['a string', 'x'],
    ['a number', 42],
    ['an array of non-objects', [1, null, 'a', []]],
  ]

  it.each(BAD_ITEMS)('renders nothing for %s', (_label, items) => {
    expect(renderCardGrid(cardGrid({ items }))).toBe('')
  })

  it('leaves no card markup and no unknown-block comment on the page', () => {
    for (const [, items] of BAD_ITEMS) {
      const html = rendered({ items })
      expect(html).not.toContain(BOX_STYLE)
      expect(html).not.toContain('Unknown block type')
      expect(html).not.toContain('data-sb-filter')
    }
  })

  it('drops the heading and every other trace when the item list is empty', () => {
    const props = { title: 'Products', subtitle: 'Pick a category', items: [] }
    expect(renderCardGrid(cardGrid(props))).toBe('')
    const html = rendered(props)
    expect(html).not.toContain('Products')
    expect(html).not.toContain('Pick a category')
    expect(html).not.toContain(BOX_STYLE)
  })

  it('renders one placeholder card for an empty item object', () => {
    // An object is an item shape: one card per object, so a blank row is a
    // placeholder card rather than being silently dropped. Pinned here because
    // an operator-added empty row (the next editor atom) exports this artifact.
    const doc = parse(rendered({ items: [{}] }))
    const cards = [...doc.querySelectorAll('article')]
    expect(cards).toHaveLength(1)
    expect(cards[0].querySelector('img')).toBeNull()
    expect(cards[0].children[0].innerHTML).toContain('from-bg-3')
    expect(cards[0].children[1].children).toHaveLength(0)
  })

  it('shapes items: skips non-plain objects and reads non-strings as absent', () => {
    const shaped = toCardGridItems([null, 1, 'a', [], { name: 42, price: { amount: 1 }, category: 'Shoes' }])
    expect(shaped).toEqual([
      { image: '', alt: '', name: '', description: '', price: '', category: 'Shoes', ctaText: '', ctaUrl: '' },
    ])
  })

  it('reads a non-array list as empty', () => {
    expect(toCardGridItems(undefined)).toEqual([])
    expect(toCardGridItems({})).toEqual([])
    expect(toCardGridItems('x')).toEqual([])
  })
})

describe('the new modules stay framework-free', () => {
  const MODULES = ['src/lib/card-grid-items.ts', 'src/lib/export-blocks/render-card-grid.ts']
  const BANNED = ['react', 'lucide-react', '@/editor', '@/store']

  const specifiersOf = (relativePath: string): string[] =>
    [
      ...readFileSync(resolve(import.meta.dirname, '..', relativePath), 'utf8').matchAll(
        /from\s+['"]([^'"]+)['"]/g,
      ),
    ].map((match) => match[1])

  it('the item-shaping module imports nothing at all', () => {
    expect(specifiersOf('src/lib/card-grid-items.ts')).toEqual([])
  })

  it.each(MODULES)('%s reaches no editor, UI framework or .tsx module', (relativePath) => {
    for (const specifier of specifiersOf(relativePath)) {
      expect(BANNED.some((banned) => specifier === banned || specifier.startsWith(`${banned}/`))).toBe(false)
      expect(specifier.includes('.tsx')).toBe(false)
    }
  })
})
