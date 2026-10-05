/**
 * SC-M02 (mechanical half) — a URL typed into the properties panel is the URL
 * that reaches the published page.
 *
 * SC-M02 is `[HUMAN-ONLY]` because its final step — "clickable and navigates to
 * the intended destination in a real browser" — needs a browser. Its two
 * deterministic halves are already covered separately: SC-019 exercises the
 * panel's fields, and SC-014/015/016 exercise the exporter's anchor output.
 *
 * What nothing covered is the SEAM between them. Each half could pass in
 * isolation while the URL a user types is mangled in transit — normalised into
 * a bare string, dropped when the item converts from `string` to `{label,href}`,
 * or silently discarded by the policy gate. This file drives the real panel,
 * reads the resulting config out of the store, publishes it, and asserts the
 * typed URL is the href in the output. That leaves only the click itself for a
 * human.
 *
 * No @testing-library dependency — react-dom/client + act + jsdom, matching
 * `properties-panel-link-fields.test.tsx`.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PropertiesPanel } from '../src/editor/PropertiesPanel'
import { useConfigStore } from '../src/store/configStore'
import { defaultPricingTiers } from '../src/lib/block-default-content'
import { exportSiteToHTML } from '../src/lib/export-html'
import type { BlockConfig } from '../src/blocks/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots.length = 0
})

function seed(block: BlockConfig): void {
  useConfigStore.getState().setConfig({
    name: 'X',
    pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [block] }],
    blocks: [block],
  })
}

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

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Publish exactly what the store holds after the panel edit. */
function publishedHtml(): string {
  return exportSiteToHTML(useConfigStore.getState().config)
}

describe('SC-M02 — panel edit reaches the published href', () => {
  it('navbar: a URL typed into a link field publishes as that link item href', () => {
    const block: BlockConfig = {
      id: 'b-nav',
      type: 'navbar',
      variant: 'default',
      props: { logo: 'Northwind', links: ['Features', 'Pricing'], ctaText: 'Go', ctaUrl: '' },
    }
    seed(block)
    const container = renderPanel(block)

    setInputValue(findInput(container, 'URL')!, 'https://shop.example.com/features')

    const html = publishedHtml()
    expect(html).toContain('href="https://shop.example.com/features"')
    expect(html).toContain('Features') // the label survived the string->object conversion
  })

  it('navbar: a CTA URL typed into the panel publishes as the CTA href', () => {
    const block: BlockConfig = {
      id: 'b-nav',
      type: 'navbar',
      variant: 'default',
      props: { logo: 'Northwind', links: ['Features'], ctaText: 'Start free', ctaUrl: '' },
    }
    seed(block)
    const container = renderPanel(block)

    setInputValue(findInput(container, 'CTA URL')!, 'https://shop.example.com/signup')

    const html = publishedHtml()
    expect(html).toContain('href="https://shop.example.com/signup"')
    expect(html).toContain('Start free')
  })

  it('pricing: a tier CTA URL typed into the panel publishes as that tier’s href', () => {
    const block: BlockConfig = {
      id: 'b-price',
      type: 'pricing',
      variant: 'simple',
      props: { title: 'Plans', tiers: defaultPricingTiers },
    }
    seed(block)
    const container = renderPanel(block)

    setInputValue(findInput(container, 'CTA URL')!, 'https://shop.example.com/buy')

    const html = publishedHtml()
    expect(html).toContain('href="https://shop.example.com/buy"')
  })

  it('a rejected scheme typed into the panel never reaches the published page', () => {
    // The panel accepts whatever is typed — the gate is the exporter. This pins
    // that the seam is policy-safe end to end rather than only at each half.
    const block: BlockConfig = {
      id: 'b-nav',
      type: 'navbar',
      variant: 'default',
      props: { logo: 'Northwind', links: ['Features'], ctaText: 'Go', ctaUrl: '' },
    }
    seed(block)
    const container = renderPanel(block)

    setInputValue(findInput(container, 'CTA URL')!, 'javascript:alert(1)')

    // The value IS stored (the panel does not police input)...
    expect(useConfigStore.getState().config.blocks[0].props.ctaUrl).toBe('javascript:alert(1)')
    // ...and the published output contains no trace of it.
    const html = publishedHtml()
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('alert(1)')
  })
})
