/**
 * Unit tests for the frozen-segment subsequence matcher.
 *
 * The baseline suite that consumes this helper runs on the release where the
 * frozen list still equals the live source, so every branch below (missing
 * line, two runs, trailing insertion) would otherwise be dead code. These
 * cases are synthetic on purpose: they must not depend on the runtime source.
 */
import { describe, it, expect } from 'vitest'
import { checkRuntimeSegments } from './helpers/runtime-segment-subsequence'

const FROZEN = ['a', 'b', 'c', 'z']

describe('frozen segments still present', () => {
  it('an identical list is intact, with nothing inserted', () => {
    const check = checkRuntimeSegments(FROZEN, FROZEN)
    expect(check.missing).toEqual([])
    expect(check.inserted).toEqual([])
    expect(check.oneRun).toBe(true)
    expect(check.beforeLast).toBe(true)
  })

  it('one inserted run before the closing line is accepted', () => {
    const check = checkRuntimeSegments(FROZEN, ['a', 'b', 'n1', 'n2', 'c', 'z'])
    expect(check.missing).toEqual([])
    expect(check.inserted).toEqual([2, 3])
    expect(check.oneRun).toBe(true)
    expect(check.beforeLast).toBe(true)
  })

  it('a single inserted line is one run', () => {
    expect(checkRuntimeSegments(FROZEN, ['a', 'b', 'n', 'c', 'z']).oneRun).toBe(true)
  })
})

describe('frozen segments broken apart', () => {
  it('names a dropped line', () => {
    const check = checkRuntimeSegments(FROZEN, ['a', 'c', 'z'])
    expect(check.missing).toEqual(['b'])
  })

  it('names a line edited in place', () => {
    expect(checkRuntimeSegments(FROZEN, ['a', 'b', 'c!', 'z']).missing).toEqual(['c'])
  })

  it('rejects a reordered pair', () => {
    // Forward-only matching cannot reach 'b' once 'a' has been passed.
    expect(checkRuntimeSegments(FROZEN, ['b', 'a', 'c', 'z']).missing).toEqual(['b'])
  })

  it('rejects two separated insertions', () => {
    const check = checkRuntimeSegments(FROZEN, ['a', 'n', 'b', 'c', 'm', 'z'])
    expect(check.inserted).toEqual([1, 4])
    expect(check.oneRun).toBe(false)
  })

  it('rejects an insertion after the closing line', () => {
    const check = checkRuntimeSegments(FROZEN, ['a', 'b', 'c', 'z', 'n'])
    expect(check.oneRun).toBe(true)
    expect(check.beforeLast).toBe(false)
  })

  it('rejects a closing line that moved', () => {
    // Truncated source: the frozen closing segment is gone, so nothing closes it.
    expect(checkRuntimeSegments(FROZEN, ['a', 'b', 'c']).beforeLast).toBe(false)
  })

  it('accepts an insertion that still leaves the closing line last', () => {
    expect(checkRuntimeSegments(FROZEN, ['a', 'n', 'b', 'c', 'z']).beforeLast).toBe(true)
  })
})
