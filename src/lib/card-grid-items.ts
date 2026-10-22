/**
 * Item shaping for the `card-grid` block.
 *
 * The prop normalizer replaces an empty or garbage array with the block's
 * default array only when that default is non-empty. This block's default is
 * `[]`, so a validated or imported config keeps whatever JSON lands under
 * `items` — including primitives, nested arrays and non-string field values.
 * Every consumer therefore shapes the list through this one module: non-plain-
 * object entries are skipped, a non-string field reads as absent, and a
 * whitespace-only value counts as absent for every displayed field.
 *
 * Imports nothing at all: the exporter, the worker entry and the editor canvas
 * all reach this module, so anything imported here would be pulled into all of
 * them.
 */

/** One card's plain-string fields; absent input becomes the empty string. */
export interface CardGridItem {
  image: string
  alt: string
  name: string
  description: string
  price: string
  category: string
  ctaText: string
  ctaUrl: string
}

/**
 * True when `value` is a string with non-whitespace content. Used as the
 * "display this field" test everywhere, so a padded or blank value can never
 * produce an empty-looking element or an invisible call to action.
 */
export function isPresent(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** A stored string, or the empty string for any other JSON value. Never trims. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * A JSON object, excluding arrays: an array is technically `typeof 'object'`
 * but is not an item shape, and treating it as one would render a ghost card.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * One shaped item per plain object of `items`, in order. A non-array value, or
 * an array with no plain objects, yields an empty list — the renderer then emits
 * nothing at all, so a block that holds no products adds no markup, not even its
 * heading.
 */
export function toCardGridItems(items: unknown): CardGridItem[] {
  if (!Array.isArray(items)) return []
  const shaped: CardGridItem[] = []
  for (const entry of items) {
    if (!isPlainObject(entry)) continue
    shaped.push({
      image: text(entry.image),
      alt: text(entry.alt),
      name: text(entry.name),
      description: text(entry.description),
      price: text(entry.price),
      category: text(entry.category),
      ctaText: text(entry.ctaText),
      ctaUrl: text(entry.ctaUrl),
    })
  }
  return shaped
}

/**
 * The `alt` attribute value: the item alt, else its name, else the empty string.
 * Always a string, so the attribute is always present on an emitted image.
 */
export function cardImageAlt(item: CardGridItem): string {
  if (isPresent(item.alt)) return item.alt
  if (isPresent(item.name)) return item.name
  return ''
}
