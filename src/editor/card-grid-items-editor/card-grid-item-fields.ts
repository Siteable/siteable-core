/** The eight fields of a product card, in display order, and the new-item template. */
export const CARD_GRID_ITEM_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'image', label: 'Image URL' },
  { key: 'alt', label: 'Alt Text' },
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description' },
  { key: 'price', label: 'Price' },
  { key: 'category', label: 'Category' },
  { key: 'ctaText', label: 'CTA Text' },
  { key: 'ctaUrl', label: 'CTA URL' },
]

export const UNCATEGORISED_LABEL = 'Uncategorised'

/**
 * A new product: all eight keys as empty strings, plus any extra keys of the
 * first stored item carried over with their type (array -> [], string -> '').
 */
export function createCardGridItem(first: unknown): Record<string, unknown> {
  const template: Record<string, unknown> = {
    image: '', alt: '', name: '', description: '',
    price: '', category: '', ctaText: '', ctaUrl: '',
  }
  const source = first && typeof first === 'object' && !Array.isArray(first) ? first : {}
  for (const [key, val] of Object.entries(source)) {
    if (key in template) continue
    template[key] = Array.isArray(val) ? [] : typeof val === 'string' ? '' : val
  }
  return template
}
