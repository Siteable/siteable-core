import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PropertiesPanel } from '../src/editor/PropertiesPanel'
import { useConfigStore } from '../src/store/configStore'
import { defaultPricingTiers } from '../src/lib/block-default-content'
import type { BlockConfig } from '../src/blocks/types'

// Phase 04 — SC-019: the properties panel exposes an editable field for each
// new URL prop (navbar ctaUrl, per-link Label/URL, pricing tier ctaUrl) and
// saves the typed value to the config store. No @testing-library dependency —
// react-dom/client + act + jsdom only.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots.length = 0
})

function renderPanel(block: BlockConfig): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(<PropertiesPanel block={block} />)
  })
  return container
}

function findInput(container: HTMLElement, subLabel: string): HTMLInputElement | null {
  const label = [...container.querySelectorAll('label')].find((l) => l.textContent?.trim() === subLabel)
  return (label?.parentElement?.querySelector('input') as HTMLInputElement | null) ?? null
}

function countLabels(container: HTMLElement, subLabel: string): number {
  return [...container.querySelectorAll('label')].filter((l) => l.textContent?.trim() === subLabel).length
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function seed(block: BlockConfig): void {
  useConfigStore.getState().setConfig({
    name: 'X',
    pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [block] }],
    blocks: [block],
  })
}

function storedBlockProps(): Record<string, any> {
  return useConfigStore.getState().config.pages![0].blocks[0].props as Record<string, any>
}

describe('SC-019 — properties panel link/URL fields', () => {
  it('navbar exposes a CTA URL field and Label/URL inputs per link; URL edit converts a string item', () => {
    const navbarBlock: BlockConfig = {
      id: 'b-nav', type: 'navbar', variant: 'default',
      props: { logo: 'A', links: ['Features', 'Pricing'], ctaText: 'Go', ctaUrl: '' },
    }
    seed(navbarBlock)
    const container = renderPanel(navbarBlock)

    expect(findInput(container, 'CTA URL')).not.toBeNull()
    expect(countLabels(container, 'Label')).toBe(2)
    expect(countLabels(container, 'URL')).toBe(2)

    const urlInput = findInput(container, 'URL')!
    setInputValue(urlInput, 'https://x/a')

    // string -> object conversion on URL touch, label preserved as the string value.
    expect(storedBlockProps().links[0]).toEqual({ label: 'Features', href: 'https://x/a' })
  })

  it('footer exposes a Label/URL input per link and saves a URL edit', () => {
    // SC-019 names "navbar/footer/pricing"; the footer's top-level `links` uses
    // the same `array-links` field as the navbar. (Nested `columns[].links` has
    // no panel field — a deliberate phase-04 boundary, not a spec gap.)
    const footerBlock: BlockConfig = {
      id: 'b-footer', type: 'footer', variant: 'simple',
      props: { logo: 'A', copyright: 'C', links: ['Privacy', 'Terms'] },
    }
    seed(footerBlock)
    const container = renderPanel(footerBlock)

    expect(countLabels(container, 'Label')).toBe(2)
    expect(countLabels(container, 'URL')).toBe(2)

    const urlInput = findInput(container, 'URL')!
    setInputValue(urlInput, 'https://x/privacy')
    expect(storedBlockProps().links[0]).toEqual({ label: 'Privacy', href: 'https://x/privacy' })
  })

  it('pricing exposes a ctaUrl input per tier and saves edits', () => {
    const pricingBlock: BlockConfig = {
      id: 'b-price', type: 'pricing', variant: 'simple',
      props: { title: 'P', tiers: defaultPricingTiers },
    }
    seed(pricingBlock)
    const container = renderPanel(pricingBlock)

    const ctaUrlInput = findInput(container, 'CTA URL')
    expect(ctaUrlInput).not.toBeNull()

    setInputValue(ctaUrlInput!, 'https://x/buy')
    expect(storedBlockProps().tiers[0].ctaUrl).toBe('https://x/buy')
  })

  it('array-items is type-safe: complex sub-values are read-only and add-item preserves their type', () => {
    const pricingBlock: BlockConfig = {
      id: 'b-price2', type: 'pricing', variant: 'simple',
      props: { title: 'P', tiers: defaultPricingTiers },
    }
    seed(pricingBlock)
    const container = renderPanel(pricingBlock)

    // The tier `features` (string[]) must NOT be editable as a text input — a
    // string write would break PricingBlock's `tier.features.map`.
    const featuresInput = findInput(container, 'Features')
    expect(featuresInput).not.toBeNull()
    expect(featuresInput!.disabled).toBe(true)

    // The string `ctaUrl` field stays editable.
    expect(findInput(container, 'CTA URL')!.disabled).toBe(false)

    // Add-item must preserve each field's type (array stays array), so the new
    // tier renders without throwing.
    const addButton = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Add item'))!
    act(() => addButton.click())
    const tiers = storedBlockProps().tiers as Array<Record<string, unknown>>
    expect(Array.isArray(tiers[tiers.length - 1].features)).toBe(true)
  })

  it('add-item after deleting every tier produces a well-shaped tier (features stays an array)', () => {
    const pricingBlock: BlockConfig = {
      id: 'b-price3', type: 'pricing', variant: 'simple',
      props: { title: 'P', tiers: [] },
    }
    seed(pricingBlock)
    const container = renderPanel(pricingBlock)

    const addButton = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Add item'))!
    act(() => addButton.click())
    const tiers = storedBlockProps().tiers as Array<Record<string, unknown>>
    expect(tiers).toHaveLength(1)
    expect(Array.isArray(tiers[0].features)).toBe(true)
    expect(tiers[0]).toHaveProperty('name')
    expect(tiers[0]).toHaveProperty('ctaUrl')
  })
})
