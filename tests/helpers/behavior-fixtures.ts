/**
 * Block fixtures for the shared behavior table.
 *
 * A fixture is a list of block configs — the single source of markup for both
 * environments the table runs against (an exported page and the React editor
 * preview). Keeping them in their own module keeps the table runner small and
 * lets a new behavior add a fixture without editing the runner's cases.
 */
import type { BlockConfig } from '../../src/blocks/types'

export type Fixture =
  | 'navbar'
  | 'two-navbars'
  | 'faq'
  | 'navbar-and-faq'
  | 'tabs'
  | 'two-tab-sets'
  | 'tab-sets-shared-id'
  | 'tabs-blank-titles'
  | 'carousel-testimonials'
  | 'carousel-gallery'
  | 'two-carousels'
  | 'carousels-shared-id'
  | 'carousel-and-tabs'
  | 'carousel-scroller-variant'
  | 'card-grid-filter'
  | 'two-card-grids'
  | 'card-grids-shared-id'
  | 'card-grid-case-merge'
  | 'card-grid-many-categories'

const navbarBlock = (id: string, variant: string): BlockConfig => ({
  id,
  type: 'navbar',
  variant,
  props: {
    logo: 'Acme',
    links: [
      { label: 'Product', href: '/product' },
      { label: 'Pricing', href: '/pricing' },
    ],
    ctaText: 'Start',
    ctaUrl: 'https://example.com/start',
  },
})

const faqBlock = (id: string): BlockConfig => ({
  id,
  type: 'faq',
  variant: 'accordion',
  props: {
    title: 'Questions',
    items: [
      { question: 'First?', answer: 'One.' },
      { question: 'Second?', answer: 'Two.' },
      { question: 'Third?', answer: 'Three.' },
    ],
  },
})

/** A features block opting into the tab layout. Descriptions are distinct so
 * a panel bound to the wrong item is observable. */
const tabsBlock = (id: string, variant: string): BlockConfig => ({
  id,
  type: 'features',
  variant,
  props: {
    title: 'Capabilities',
    display: 'tabs',
    items: [
      { icon: 'Zap', title: 'First feature', description: 'First description.' },
      { icon: 'Shield', title: 'Second feature', description: 'Second description.' },
      { icon: 'Globe', title: 'Third feature', description: 'Third description.' },
    ],
  },
})

/** Two items carry a blank or whitespace-only title, so the fallback label shows. */
const blankTitleTabsBlock = (): BlockConfig => ({
  id: 'feat-blank',
  type: 'features',
  variant: 'grid',
  props: {
    title: 'Unnamed',
    display: 'tabs',
    items: [
      { title: '', description: 'Nameless one.' },
      { title: '   ', description: 'Nameless two.' },
      { title: 'Third feature', description: 'Third description.' },
    ],
  },
})

/** A testimonials block opting into the carousel. Distinct text per slide, so a
 * slide bound to the wrong item is observable. */
const carouselTestimonialsBlock = (id: string, variant: string, count: number): BlockConfig => ({
  id,
  type: 'testimonials',
  variant,
  props: {
    title: 'Customer stories',
    display: 'carousel',
    items: Array.from({ length: count }, (_, index) => ({
      name: `Person ${index + 1}`,
      role: `Role ${index + 1}`,
      quote: `Quote ${index + 1}`,
      rating: (index % 5) + 1,
    })),
  },
})

/** A gallery block opting into the carousel. Empty sources render the gradient
 * placeholder, so the browser lane makes no network request. */
const carouselGalleryBlock = (id: string, count: number): BlockConfig => ({
  id,
  type: 'gallery',
  variant: 'grid',
  props: {
    title: 'Gallery picks',
    display: 'carousel',
    images: Array.from({ length: count }, (_, index) => ({
      src: '',
      alt: `Picture ${index + 1}`,
      caption: `Caption ${index + 1}`,
    })),
  },
})

/** A filter grid: two Shoes, one Hats, one Bags and one uncategorised card. */
const cardGridFilterBlock = (): BlockConfig => ({
  id: 'cg-1',
  type: 'card-grid',
  variant: 'product',
  props: {
    title: 'Products',
    subtitle: 'Browse the range',
    display: 'filter',
    items: [
      { name: 'Runner', category: 'Shoes', price: '$40' },
      { name: 'Trail', category: 'Shoes', price: '$50' },
      { name: 'Cap', category: 'Hats', price: '$20' },
      { name: 'Tote', category: 'Bags', price: '$30' },
      { name: 'Gift card' },
    ],
  },
})

/** A shorter filter grid (two Shoes, one Hats) used when two grids share a page. */
const cardGridShortBlock = (id: string): BlockConfig => ({
  id,
  type: 'card-grid',
  variant: 'product',
  props: {
    title: 'More products',
    display: 'filter',
    items: [
      { name: 'Runner', category: 'Shoes' },
      { name: 'Trail', category: 'Shoes' },
      { name: 'Cap', category: 'Hats' },
    ],
  },
})

/** One category spelled three ways; trimming and lower-casing must merge them. */
const cardGridCaseMergeBlock = (): BlockConfig => ({
  id: 'cg-merge',
  type: 'card-grid',
  variant: 'product',
  props: {
    title: 'Sizes',
    display: 'filter',
    items: [
      { name: 'Runner', category: 'Shoes' },
      { name: 'Trail', category: ' shoes ' },
      { name: 'Court', category: 'SHOES' },
      { name: 'Cap', category: 'Hats' },
    ],
  },
})

/** Eight distinct categories, so a narrow viewport has a button row to wrap. */
const cardGridManyCategoriesBlock = (): BlockConfig => ({
  id: 'cg-many',
  type: 'card-grid',
  variant: 'product',
  props: {
    title: 'Departments',
    display: 'filter',
    items: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'].map(
      (category, index) => ({ name: `Item ${index + 1}`, category }),
    ),
  },
})

/** Block configs are the single source of markup for both environments. */
export const FIXTURE_BLOCKS: Record<Fixture, BlockConfig[]> = { navbar: [navbarBlock('nav-1', 'default')],
  'two-navbars': [navbarBlock('nav-1', 'default'), navbarBlock('nav-2', 'centered')],
  faq: [faqBlock('faq-1')],
  'navbar-and-faq': [navbarBlock('nav-1', 'default'), faqBlock('faq-1')],
  tabs: [tabsBlock('feat-1', 'grid')],
  'two-tab-sets': [tabsBlock('feat-1', 'list'), tabsBlock('feat-2', 'alternating')],
  'tab-sets-shared-id': [tabsBlock('feat-1', 'grid'), tabsBlock('feat-1', 'list')],
  'tabs-blank-titles': [blankTitleTabsBlock()],
  'carousel-testimonials': [carouselTestimonialsBlock('test-1', 'cards', 3)],
  'carousel-gallery': [carouselGalleryBlock('gal-1', 4)],
  'two-carousels': [
    carouselTestimonialsBlock('test-1', 'cards', 3),
    carouselGalleryBlock('gal-1', 4),
  ],
  'carousels-shared-id': [carouselGalleryBlock('gal-1', 3), carouselGalleryBlock('gal-1', 3)],
  'carousel-and-tabs': [tabsBlock('feat-1', 'grid'), carouselTestimonialsBlock('test-1', 'cards', 3)],
  'carousel-scroller-variant': [carouselTestimonialsBlock('test-1', 'scroller', 2)],
  'card-grid-filter': [cardGridFilterBlock()],
  'two-card-grids': [cardGridShortBlock('cg-a'), cardGridShortBlock('cg-b')],
  'card-grids-shared-id': [cardGridShortBlock('cg-1'), cardGridShortBlock('cg-1')],
  'card-grid-case-merge': [cardGridCaseMergeBlock()],
  'card-grid-many-categories': [cardGridManyCategoriesBlock()],
}
