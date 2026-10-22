/**
 * Subsequence check for the frozen behavior-runtime segment list.
 *
 * The shared runtime source is frozen as an array of its lines, so a later
 * change can be proven to be an EXTENSION of the released script rather than a
 * rewrite: every frozen line must still appear, in order, and the only new
 * lines allowed are one contiguous run placed before the closing line.
 *
 * Kept out of the baseline suite so the matcher can be exercised against
 * synthetic input: on the release that introduces the fixture the frozen list
 * and the live source are identical, so the interesting branches would
 * otherwise never run.
 */

/** Outcome of matching a frozen segment list against the current source lines. */
export interface SegmentCheck {
  /** Frozen segments that no longer appear, in source order. Empty means intact. */
  missing: string[]
  /** Indexes in `current` that no frozen segment consumed. */
  inserted: number[]
  /** True when the inserted lines form at most one contiguous run. */
  oneRun: boolean
  /**
   * True when nothing follows the frozen closing segment: the live source ends
   * on it, and any inserted run sits before it.
   */
  beforeLast: boolean
}

/**
 * Match `frozen` against `current` greedily and forward only.
 *
 * A dropped, reordered or in-place-edited frozen line therefore leaves an
 * unmatched entry in `missing`; it can never be absorbed by a later duplicate.
 * Duplicate lines in the runtime (`}`, `if(rm())…`) make the match ambiguous in
 * principle, but the run and closing-segment checks below bound what an
 * ambiguous match could hide.
 */
export function checkRuntimeSegments(frozen: string[], current: string[]): SegmentCheck {
  const consumed = new Set<number>()
  const missing: string[] = []
  let cursor = 0

  for (const segment of frozen) {
    const found = current.indexOf(segment, cursor)
    if (found === -1) {
      missing.push(segment)
      continue
    }
    consumed.add(found)
    cursor = found + 1
  }

  const inserted = current.map((_, index) => index).filter((index) => !consumed.has(index))
  const first = inserted[0]
  const last = inserted[inserted.length - 1]
  const closing = frozen[frozen.length - 1]

  return {
    missing,
    inserted,
    oneRun: inserted.length <= 1 || last - first + 1 === inserted.length,
    beforeLast:
      inserted.length === 0
        ? current[current.length - 1] === closing
        : current[current.length - 1] === closing && last < current.length - 1,
  }
}
