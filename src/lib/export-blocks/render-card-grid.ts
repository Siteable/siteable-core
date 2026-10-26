import type { BlockConfig } from '@/blocks/types'
import { escapeHtml } from '@/lib/html-escape'
import { imgHintAttrs } from '@/lib/export-img-hints'
import { isAllowedUrl } from '@/lib/url-policy'
import { cardGridCategoryKey, cardGridCategories, isFilterCardGrid } from '@/lib/export-behavior-runtime'
import { cardImageAlt, isPresent, toCardGridItems, type CardGridItem } from '@/lib/card-grid-items'
import { IMAGE_ICON_24 } from './render-gallery'

/**
 * `card-grid` block (single variant: product).
 *
 * Each object of `items` becomes one card: an inline 4:3 image box, the category
 * label, the name, the description, the price and an optional call to action.
 * The ratio and the cover fit are set INLINE because export layout classes come
 * from a late-loading style script — with scripts off there is no stylesheet to
 * guarantee them.
 *
 * With `display: filter` and at least two distinct normalised categories, the
 * grid is wrapped in a `data-sb-filter` scope with an "All" button followed by
 * one button per category. The renderer only emits markup; the shared runtime
 * owns the behaviour, and the no-script rule hides the buttons so every card
 * stays visible.
 *
 * The card element itself carries no display utility and always carries
 * `data-sb-category` inside a filter scope (empty when uncategorised): the
 * runtime hides a card through the `hidden` attribute, and a display utility
 * would outrank the user agent's `[hidden]` rule.
 */

const BOX_STYLE = 'aspect-ratio:4/3;overflow:hidden'
const IMAGE_STYLE = 'width:100%;height:100%;object-fit:cover'

const GRID_CLASS = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'
const CARD_CLASS = 'rounded-lg overflow-hidden border border-border-default bg-bg-1'
const PLACEHOLDER_CLASS =
  'w-full h-full bg-gradient-to-br from-bg-3 to-bg-4 flex items-center justify-center'

/**
 * Buttons are at least 32 px square so a touch target survives a narrow
 * viewport, and the active look comes from `aria-pressed:` variants — the
 * runtime only ever sets the attribute, never toggles a class.
 */
const FILTER_BUTTON_CLASS =
  'min-h-[32px] min-w-[32px] px-3 py-1.5 rounded-full border border-border-default bg-bg-2 text-sm text-text-2 transition-colors hover:border-border-hover aria-pressed:bg-green/10 aria-pressed:border-green aria-pressed:text-green'

function media(item: CardGridItem): string {
  if (isAllowedUrl(item.image, { image: true })) {
    return `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(cardImageAlt(item))}" style="${IMAGE_STYLE}"${imgHintAttrs('lazy')} />`
  }
  return `<div class="${PLACEHOLDER_CLASS}">${IMAGE_ICON_24}</div>`
}

function body(item: CardGridItem): string {
  const parts: string[] = []
  if (isPresent(item.category)) {
    parts.push(
      `<div class="text-[11px] font-semibold uppercase tracking-widest text-green mb-1">${escapeHtml(item.category)}</div>`,
    )
  }
  if (isPresent(item.name)) {
    parts.push(`<h3 class="text-lg font-semibold text-text-0">${escapeHtml(item.name)}</h3>`)
  }
  if (isPresent(item.description)) {
    parts.push(`<p class="text-sm text-text-2">${escapeHtml(item.description)}</p>`)
  }
  if (isPresent(item.price)) {
    parts.push(`<div class="text-base font-semibold text-text-0 mt-1">${escapeHtml(item.price)}</div>`)
  }
  if (isPresent(item.ctaText) && isPresent(item.ctaUrl) && isAllowedUrl(item.ctaUrl)) {
    parts.push(
      `<a href="${escapeHtml(item.ctaUrl)}" class="text-sm font-medium text-green hover:text-green-dim">${escapeHtml(item.ctaText)}</a>`,
    )
  }
  return parts.join('')
}

function card(item: CardGridItem, filtered: boolean): string {
  const keyAttr = filtered ? ` data-sb-category="${escapeHtml(cardGridCategoryKey(item.category))}"` : ''
  return `          <article${keyAttr} class="${CARD_CLASS}">
            <div style="${BOX_STYLE}" class="bg-bg-3">${media(item)}</div>
            <div class="p-4 flex flex-col gap-1">${body(item)}</div>
          </article>`
}

function filterButton(key: string, label: string, pressed: boolean): string {
  return `          <button type="button" data-sb-filter-btn="${escapeHtml(key)}" aria-pressed="${pressed ? 'true' : 'false'}" class="${FILTER_BUTTON_CLASS}">${escapeHtml(label)}</button>`
}

/**
 * The whole block, or the empty string when it holds no product items — an
 * empty block drops its heading too, so a config that carries the block but no
 * products adds nothing to the page.
 */
export function renderCardGrid(block: BlockConfig): string {
  const props = block.props || {}
  const items = toCardGridItems(props.items)
  if (items.length === 0) return ''

  const filtered = isFilterCardGrid(block)
  const title = isPresent(props.title)
    ? `      <h2 class="text-2xl font-semibold mb-2 text-center">${escapeHtml(props.title)}</h2>\n`
    : ''
  const subtitle = isPresent(props.subtitle)
    ? `      <p class="text-text-2 mb-6 text-center">${escapeHtml(props.subtitle)}</p>\n`
    : ''
  const cards = items.map((item) => card(item, filtered)).join('\n')

  const grid = `        <div class="${GRID_CLASS}">
${cards}
        </div>`

  const buttons = filtered
    ? [
        filterButton('', 'All', true),
        ...cardGridCategories(props.items).map((category) =>
          filterButton(category.key, category.label, false),
        ),
      ].join('\n')
    : ''

  const inner = filtered
    ? `      <div data-sb-filter>
        <div class="flex flex-wrap gap-2 justify-center mb-6">
${buttons}
        </div>
${grid}
      </div>`
    : grid

  return `  <section class="px-6 md:px-10 py-12 md:py-16">
    <div class="max-w-6xl mx-auto">
${title}${subtitle}${inner}
    </div>
  </section>`
}
