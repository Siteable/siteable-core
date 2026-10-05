/**
 * Public-API barrel tripwires.
 *
 * The barrel `src/index.ts` IS the package's contract: `package.json` publishes
 * `["dist", "src", "NOTICE"]` and the workspace convention is that consumers
 * import through the entry rather than deep-importing (a deep import would
 * instantiate a second zustand singleton and break the single-store invariant).
 * So a barrel regression is a real, consumer-visible break — and nothing else in
 * the suite imports it, which would make such a regression invisible.
 *
 * This file exists to assert the new publish-fidelity surface actually routes
 * through the barrel, rather than a feature test importing `src/lib/...`
 * directly and proving nothing about the entry point.
 */
import { describe, it, expect } from 'vitest'
import { isAllowedUrl as isAllowedUrlViaLib } from '../src/lib/url-policy'
import * as barrel from '../src/index'

describe('public API barrel', () => {
  it('re-exports isAllowedUrl, and it is the same function the lib module defines', () => {
    // Identity, not just presence: this rules out the barrel re-implementing or
    // shadow-wrapping the policy, which is how the two copies could drift.
    expect(barrel.isAllowedUrl).toBe(isAllowedUrlViaLib)
  })

  it('is callable through the barrel with the same behavior', () => {
    expect(barrel.isAllowedUrl('https://x')).toBe(true)
    expect(barrel.isAllowedUrl('javascript:alert(1)')).toBe(false)
    expect(barrel.isAllowedUrl('https://cdn.example.com/a.png', { image: true })).toBe(true)
    expect(barrel.isAllowedUrl('http://cdn.example.com/a.png', { image: true })).toBe(false)
  })

  it('keeps the pre-existing export-site surface intact', () => {
    // The publish-fidelity work is additive to this barrel, never a re-shape of
    // it: these are the symbols the README names as the host-app entry points,
    // so losing one would be a breaking change to a shipped package.
    for (const name of [
      'exportSiteToHTML',
      'validateSiteConfig',
      'generateSiteConfig',
      'themePresets',
      'defaultConfig',
      'useConfigStore',
    ] as const) {
      expect(barrel[name], `barrel is missing ${name}`).toBeDefined()
    }
  })
})
