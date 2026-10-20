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

/** Block configs are the single source of markup for both environments. */
export const FIXTURE_BLOCKS: Record<Fixture, BlockConfig[]> = { navbar: [navbarBlock('nav-1', 'default')],
  'two-navbars': [navbarBlock('nav-1', 'default'), navbarBlock('nav-2', 'centered')],
  faq: [faqBlock('faq-1')],
  'navbar-and-faq': [navbarBlock('nav-1', 'default'), faqBlock('faq-1')],
  tabs: [tabsBlock('feat-1', 'grid')],
  'two-tab-sets': [tabsBlock('feat-1', 'list'), tabsBlock('feat-2', 'alternating')],
  'tab-sets-shared-id': [tabsBlock('feat-1', 'grid'), tabsBlock('feat-1', 'list')],
  'tabs-blank-titles': [blankTitleTabsBlock()],
}
