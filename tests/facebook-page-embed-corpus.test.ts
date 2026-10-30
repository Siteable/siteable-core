/**
 * Shape contract for the hostile Facebook Page URL / title corpus.
 *
 * The corpus itself is the load-bearing artifact: these assertions pin its
 * size, its canonical-form guarantees and the hostile categories it must
 * cover, so a later implementation task can be validated against it.
 */
import { describe, expect, it } from 'vitest'

import { EXPORT_XSS_CORPUS } from './helpers/injection-corpus'
import {
  FACEBOOK_PAGE_TITLE_CORPUS,
  FACEBOOK_PAGE_URL_CORPUS,
  type FacebookPageUrlCase,
} from './helpers/facebook-page-injection-corpus'

const HOSTILE_INPUT_MARKERS = [
  '%2e',
  '/./',
  '\\',
  'https:facebook.com',
  ':443',
  'Profile.php',
  'profile.php',
  'fb.com',
  'javascript:',
  'data:',
  '@facebook.com',
  'evil',
  'onload',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
]

describe('facebook page embed injection corpus', () => {
  it('has at least 30 URL cases', () => {
    expect(Array.isArray(FACEBOOK_PAGE_URL_CORPUS)).toBe(true)
    expect(FACEBOOK_PAGE_URL_CORPUS.length).toBeGreaterThanOrEqual(30)
  })

  it('gives every URL case a non-empty input and a null-or-page expected value', () => {
    for (const testCase of FACEBOOK_PAGE_URL_CORPUS as FacebookPageUrlCase[]) {
      expect(typeof testCase.input).toBe('string')
      expect(testCase.input.length).toBeGreaterThan(0)
      if (testCase.expected !== null) {
        expect(typeof testCase.expected).toBe('string')
        expect(testCase.expected.startsWith('https://www.facebook.com/')).toBe(true)
      }
    }
  })

  it('keeps every expected value a canonical Page URL', () => {
    for (const testCase of FACEBOOK_PAGE_URL_CORPUS as FacebookPageUrlCase[]) {
      if (testCase.expected === null) continue

      const url = new URL(testCase.expected)
      expect(url.hash).toBe('')

      const idParams = url.searchParams.getAll('id')
      if (url.pathname.toLowerCase().endsWith('/profile.php')) {
        expect(url.searchParams.getAll('id').length).toBe(1)
        expect(idParams[0]).toMatch(/^\d+$/)
      } else {
        expect(url.searchParams.getAll('id').length).toBe(0)
      }

      const extraKeys = [...url.searchParams.keys()].filter((key) => key !== 'id')
      expect(extraKeys).toEqual([])
    }
  })

  it('covers every hostile input category', () => {
    const inputs = (FACEBOOK_PAGE_URL_CORPUS as FacebookPageUrlCase[]).map(
      (testCase) => testCase.input,
    )

    for (const marker of HOSTILE_INPUT_MARKERS) {
      expect(
        inputs.some((input) => input.includes(marker)),
        `expected at least one URL case whose input contains ${marker}`,
      ).toBe(true)
    }
  })

  it('mixes refused and accepted cases', () => {
    const cases = FACEBOOK_PAGE_URL_CORPUS as FacebookPageUrlCase[]
    expect(cases.some((testCase) => testCase.expected === null)).toBe(true)
    expect(cases.some((testCase) => testCase.expected !== null)).toBe(true)
  })

  it('reuses the shared export XSS corpus for titles', () => {
    expect(Array.isArray(FACEBOOK_PAGE_TITLE_CORPUS)).toBe(true)
    for (const entry of EXPORT_XSS_CORPUS) {
      expect(FACEBOOK_PAGE_TITLE_CORPUS).toContain(entry)
    }
  })

  it('includes an over-long title', () => {
    expect(FACEBOOK_PAGE_TITLE_CORPUS.some((entry) => entry.length === 10000)).toBe(true)
  })
})
