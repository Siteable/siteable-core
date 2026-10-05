/**
 * Read a prop with a fallback, distinguishing "absent" (undefined/null → use
 * the fallback) from any other value (return it as-is). Callers that need a
 * guaranteed string coerce defensively at the call site; AI-generated props can
 * hold objects or numbers where a string is expected, and the exporter must
 * never crash on them.
 */
export function prop<T>(props: Record<string, unknown>, key: string, fallback: T): T {
  const val = props[key]
  if (val === undefined || val === null) return fallback
  return val as T
}
