import { describe, it, expect, afterEach } from 'vitest'
import { renderToString } from 'react-dom/server'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { HeroBlock } from '../src/blocks/hero/HeroBlock'
import { NavbarBlock } from '../src/blocks/navbar/NavbarBlock'
import type { BlockConfig } from '../src/blocks/types'

// Editor parity fixes found while importing an AI Studio site:
//   1. HeroSplit ignored props.heroImage (always "Preview"), while the HTML exporter renders it.
//   2. The navbar hamburger below @2xl did nothing, so a narrow editor viewport had no links.

function hero(props: Record<string, unknown>): BlockConfig {
  return { id: 'h', type: 'hero', variant: 'split', props: { headline: 'H', subheadline: 'S', primaryCta: 'Go', ...props } }
}

describe('HeroBlock split heroImage (editor matches exporter)', () => {
  it('renders an <img> for a policy-passing URL and no placeholder', () => {
    const html = renderToString(<HeroBlock block={hero({ heroImage: 'https://cdn.example.com/hero.jpg' })} />)
    expect(html).toContain('src="https://cdn.example.com/hero.jpg"')
    expect(html).not.toContain('Preview')
  })

  it.each(['', 'javascript:alert(1)', '//evil.example/x.png', 'data:text/html;base64,AAAA'])(
    'keeps the placeholder for %j',
    (heroImage) => {
      const html = renderToString(<HeroBlock block={hero({ heroImage })} />)
      expect(html).not.toContain('<img')
      expect(html).toContain('Preview')
    },
  )

  it('keeps the placeholder when heroImage is absent or not a string', () => {
    expect(renderToString(<HeroBlock block={hero({})} />)).toContain('Preview')
    expect(renderToString(<HeroBlock block={hero({ heroImage: 42 })} />)).toContain('Preview')
  })
})

describe('NavbarBlock mobile menu', () => {
  let root: Root | undefined
  let host: HTMLElement | undefined
  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  function mount(variant: string): HTMLElement {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    const block: BlockConfig = {
      id: 'n', type: 'navbar', variant,
      props: { logo: 'Acme', links: [{ label: 'About', href: '/about' }, 'Plain'], ctaText: 'Start', ctaUrl: 'https://x.example/go' },
    }
    act(() => root!.render(<NavbarBlock block={block} />))
    return host
  }

  it.each(['default', 'centered'])('%s: toggle reveals a panel with every link and the CTA, and hides it again', (variant) => {
    const el = mount(variant)
    const button = el.querySelector('button[aria-label="Toggle menu"]') as HTMLButtonElement
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '') as HTMLElement
    expect(button.getAttribute('aria-expanded')).toBe('false')
    // The panel is always mounted so the button can reference it while closed.
    expect(panel).not.toBeNull()
    expect(panel.hidden).toBe(true)
    // Inline fallback: the closed panel stays hidden even without preflight.
    expect(panel.style.display).toBe('none')
    expect(button.getAttribute('aria-controls')).toBe(panel.id)

    act(() => button.click())
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(panel.hidden).toBe(false)
    expect(panel.style.display).toBe('')
    expect(panel.textContent).toContain('About')
    expect(panel.textContent).toContain('Plain')
    expect(panel.querySelector('a[href="/about"]')).not.toBeNull()
    expect(panel.querySelector('a[href="https://x.example/go"]')?.textContent).toBe('Start')

    act(() => button.click())
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(panel.hidden).toBe(true)
  })
})
