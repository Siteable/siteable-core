/**
 * Hostile strings shared by the export and editor injection tests, so both
 * exercise the same fixtures.
 */
export const EXPORT_XSS_CORPUS: string[] = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  'javascript:alert(1)',
  '&#106;avascript:alert(1)',
  '"><svg/onload=alert(1)>',
  'data:text/html,<script>alert(1)</script>',
  // Widening additions: quote breaks, a bare close bracket, a tab-split scheme.
  '" onerror="x',
  '">',
  'java\tscript:',
  '//evil.example',
]

/** The export corpus plus text shapes that only matter for editable inputs. */
export const EDITOR_INJECTION_CORPUS: string[] = [
  ...EXPORT_XSS_CORPUS,
  '‮evil‬ right-to-left override',
  'emoji \u{1F600}\u{1F680} text',
  'é̂̃ combining marks',
  'x'.repeat(10000),
  `it's a "mixed" 'quote' "set"`,
  `'"'"\`'`,
]
