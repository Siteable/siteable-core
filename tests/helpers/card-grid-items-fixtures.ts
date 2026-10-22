/** Product list fixtures for the card grid items editor tests. */

const CATEGORY_NAMES = [
  'Shoes', 'Hats', 'Bags', 'Socks', 'Belts', 'Coats',
  'Gloves', 'Scarves', 'Watches', 'Jackets', 'A&B',
]

/**
 * 50 items over 12 groups: 11 normalised categories (including the 'Shoes' /
 * ' shoes ' / 'SHOES' spelling variants and the reserved-character 'A&B') plus
 * the uncategorised group, which holds absent and whitespace-only categories.
 * Some items are sparse (only name and category).
 */
export function makeFiftyItems(): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = []
  for (let i = 0; i < 50; i++) {
    const n = i + 1
    if (i < 3) {
      items.push({ name: `Runner ${n}`, category: ['Shoes', ' shoes ', 'SHOES'][i] })
    } else if (i === 3) {
      items.push({ name: `Runner ${n}`, category: '   ' })
    } else if (i === 4) {
      items.push({ name: `Runner ${n}` })
    } else if (i % 7 === 0) {
      items.push({ name: `Cap ${n}`, category: CATEGORY_NAMES[i % CATEGORY_NAMES.length] })
    } else {
      items.push({
        image: `https://img.example/p${n}.png`,
        alt: `Product ${n}`,
        name: `Runner ${n}`,
        description: `Light and quick ${n}`,
        price: `${n}.00`,
        category: CATEGORY_NAMES[i % CATEGORY_NAMES.length],
        ctaText: 'Buy',
        ctaUrl: `https://shop.example/p${n}`,
      })
    }
  }
  return items
}
