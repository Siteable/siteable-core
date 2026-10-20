/**
 * Teeth tests for the allowed-diff normalizer.
 *
 * The legacy baselines are frozen and may never be regenerated, so the two
 * pinned byte-identity suites compare a fresh export to a frozen file only
 * after removing the permitted additions. That normalizer is the whole safety
 * property: if it over-matches, a real regression hides; if it is a no-op, the
 * suite silently passes on nothing. These tests pin both directions and assert
 * exact strip counts so a no-op cannot pass.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { exportSiteToHTML } from '../../src/lib/export-html'
import {
  stripRuntimeAdditions,
  stripLegacyFaq,
  stripRuntimeScriptText,
} from './behavior-runtime-allowed-diff'
import type { BlockConfig, SiteConfig } from '../../src/blocks/types'

const FIXTURE = resolve(import.meta.dirname, '../fixtures/export-legacy-baseline.html')

const baselineConfig: SiteConfig = {
  name: 'Legacy Baseline',
  blocks: [
    {
      id: 'nav-1',
      type: 'navbar',
      variant: 'default',
      props: {
        logo: 'Acme',
        logoImage: 'https://cdn.example.com/logo.png',
        links: ['Product', 'Features', 'Pricing', 'Docs'],
        ctaText: 'Get Started',
      },
    },
    {
      id: 'nav-2',
      type: 'navbar',
      variant: 'centered',
      props: { logo: 'Acme', links: ['Docs'], ctaText: 'Start' },
    },
    {
      id: 'q-1',
      type: 'faq',
      variant: 'accordion',
      props: {
        title: 'FAQ',
        items: [
          { question: 'What is it?', answer: 'A baseline fixture' },
          { question: 'Why?', answer: 'Byte-identity tripwire' },
        ],
      },
    },
  ] as BlockConfig[],
}

describe('stripRuntimeAdditions — exact permitted set only', () => {
  it('removes the runtime, the noscript block, the menu attributes and the panels', () => {
    const html = exportSiteToHTML(baselineConfig)
    const { html: stripped, counts } = stripRuntimeAdditions(html)

    expect(stripped).not.toContain('data-sb-runtime')
    expect(stripped).not.toContain('data-sb-menu-toggle')
    expect(stripped).not.toContain('data-sb-menu-panel')
    expect(stripped).not.toContain('<noscript>')
    expect(stripped).toContain('<nav')

    // Two navbars -> two attr runs, two panels; faq -> one script + one noscript.
    expect(counts).toEqual({ scripts: 1, noscript: 1, toggleAttrs: 2, panels: 2 })
  })

  it('does not touch bytes outside the permitted set', () => {
    const html = exportSiteToHTML(baselineConfig)
    const { html: stripped } = stripRuntimeAdditions(html)
    // Rebuild the expected document from the stripped result: re-running the
    // strip is a no-op (idempotent) and no other attr/handler is affected.
    expect(stripRuntimeAdditions(stripped).html).toBe(stripped)
    expect(stripped).toContain('aria-expanded="true"') // legacy faq state kept
    expect(stripped).toContain('faq-content') // legacy faq markup kept
  })

  it('an extra unrelated byte still fails the comparison', () => {
    // Use a frozen corpus entry (config + snapshot both on disk) so the exact
    // pinned rule is exercised end to end: normalize the fresh export, then
    // strip the legacy additions from the frozen file.
    const dir = resolve(import.meta.dirname, '../fixtures/export-legacy-corpus')
    const slug = '01-blocks-only-every-block-type'
    const entry = JSON.parse(readFileSync(resolve(dir, `${slug}.json`), 'utf8')) as {
      config: SiteConfig
      options?: { settings?: Record<string, string> }
    }
    const fresh = stripRuntimeAdditions(
      exportSiteToHTML(entry.config, entry.options ?? undefined),
    ).html
    const legacy = stripLegacyFaq(readFileSync(resolve(dir, `${slug}.html`), 'utf8')).html

    expect(fresh).toBe(legacy)
    // Teeth: an unrelated content change is a failure, not a near match.
    const mutated = exportSiteToHTML(
      { ...entry.config, name: 'Mutated' },
      entry.options ?? undefined,
    )
    expect(stripRuntimeAdditions(mutated).html).not.toBe(legacy)
  })

  it('a no-op strip cannot pass: a plain page reports zeros', () => {
    // If the normalizer returned a constant or skipped work, this would report
    // populated counts. The populated-page counts are asserted above.
    const plain = '<html><body><p>plain</p></body></html>'
    expect(stripRuntimeAdditions(plain)).toEqual({
      html: plain,
      counts: { scripts: 0, noscript: 0, toggleAttrs: 0, panels: 0 },
    })
  })
})

describe('stripLegacyFaq — exact legacy literal only', () => {
  it('removes the inline function and every onclick on the frozen baseline', () => {
    const baseline = readFileSync(FIXTURE, 'utf8')
    const { html, counts } = stripLegacyFaq(baseline)

    expect(counts).toEqual({ scripts: 1, onclick: 2, toggleFaq: 3 })
    expect(html).not.toContain('toggleFaq')
    expect(html).not.toContain(' onclick=')
  })

  it('is idempotent and leaves the rest of the document intact', () => {
    const baseline = readFileSync(FIXTURE, 'utf8')
    const { html } = stripLegacyFaq(baseline)
    expect(stripLegacyFaq(html).html).toBe(html)
    // Interior anchors prove no over-strip beyond the removed literals.
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html.endsWith('</html>') || html.endsWith('</html>\n')).toBe(true)
    expect(html).toContain('<nav')
    expect(html).toContain('<footer')
    expect(html).toContain('Get Started')
  })
})

describe('stripRuntimeScriptText — the runtime script element text only', () => {
  // The frozen 0.4.0 baseline holds the runtime source AS IT WAS THEN, so a
  // normalizer that strips the CURRENT source cannot compare against it. This
  // rule instead empties the text of the runtime script element on BOTH sides
  // and leaves every other byte in the document compared.
  const withScript = exportSiteToHTML(baselineConfig)
  const otherText = withScript.replace(
    '(function(d,w){',
    '(function(d,w){/* a future runtime revision */',
  )

  it('ignores the script element text and reports one script', () => {
    const a = stripRuntimeScriptText(withScript)
    const b = stripRuntimeScriptText(otherText)

    expect(a.html).toBe(b.html)
    expect(a.counts.scripts).toBe(1)
    expect(b.counts.scripts).toBe(1)
    // The tag survives so its position in the document stays compared.
    expect(a.html).toContain('<script data-sb-runtime></script>')
    expect(a.html).not.toContain('(function(d,w){')
  })

  it('still fails on a single byte outside the script element', () => {
    const mutated = withScript.replace('Get Started', 'Get Started!')
    expect(stripRuntimeScriptText(withScript).html).not.toBe(
      stripRuntimeScriptText(mutated).html,
    )
  })

  it('still fails on a byte inside the noscript block', () => {
    const mutated = withScript.replace('<noscript>', '<noscript> ')
    expect(stripRuntimeScriptText(withScript).html).not.toBe(
      stripRuntimeScriptText(mutated).html,
    )
  })

  it('a page without the runtime script is unchanged and reports zero', () => {
    const plain = exportSiteToHTML({
      name: 'Plain',
      blocks: [
        {
          id: 'f-1',
          type: 'features',
          variant: 'list',
          props: { title: 'Plain', items: [{ title: 'One', description: 'No runtime' }] },
        },
      ] as BlockConfig[],
    })
    expect(stripRuntimeScriptText(plain)).toEqual({ html: plain, counts: { scripts: 0 } })
  })

  it('a missing close tag leaves the tail compared instead of swallowing it', () => {
    // The one branch whose failure would HIDE content: if the rule truncated to
    // end-of-document, every element after the broken marker would vanish from
    // both sides and the difference would disappear. It must instead leave the
    // tail intact, so a lost `</script>` fails the comparison loudly.
    const broken = withScript.replace('</script>\n</body>', '<span>KEEP</span>')
    expect(broken).not.toBe(withScript) // the mutation actually landed
    expect(stripRuntimeScriptText(broken).html).toContain('<span>KEEP</span>')
  })

  it('a second, unterminated script still strips the first one and counts once', () => {
    // Asymmetric by design: the complete script is stripped, the broken tail is
    // left alone. The count reports 1, so a caller asserting 1 is told exactly
    // how many complete elements were seen.
    const O = '<script data-sb-runtime>'
    const html = `<p>a</p>${O}one()${'</script>'}<p>b</p>${O}two() unterminated`

    const result = stripRuntimeScriptText(html)
    expect(result.counts.scripts).toBe(1)
    expect(result.html).toBe(`<p>a</p>${O}${'</script>'}<p>b</p>${O}two() unterminated`)
  })
})
