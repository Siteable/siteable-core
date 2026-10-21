import { ImageIcon } from 'lucide-react'
import type { BlockConfig } from '../types'
import { isAllowedUrl } from '@/lib/url-policy'
import { cardImageAlt, isPresent, toCardGridItems, type CardGridItem } from '@/lib/card-grid-items'

/**
 * `card-grid` editor canvas (single variant: product).
 *
 * The preview shares the exporter's item shaping, alt rule and URL policies, so
 * a card looks the same before and after publishing. It is preview-only: every
 * card is always visible, no filter control is rendered and no `data-sb-*` hook
 * appears — the export runtime is not loaded in the editor, so a hook here would
 * be dead markup that invites accidental behavior. The ratio and the cover fit
 * are inline because the export's layout classes arrive with a late-loading
 * style script.
 */

const GRID_CLASS = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'
const CARD_CLASS = 'rounded-lg overflow-hidden border border-border-default bg-bg-1'
const PLACEHOLDER_CLASS =
  'w-full h-full bg-gradient-to-br from-bg-3 to-bg-4 flex items-center justify-center'
const BOX_STYLE = { aspectRatio: '4 / 3', overflow: 'hidden' } as const
const IMAGE_STYLE = { width: '100%', height: '100%', objectFit: 'cover' } as const

function Media({ item }: { item: CardGridItem }) {
  if (isAllowedUrl(item.image, { image: true })) {
    return (
      <img
        src={item.image}
        alt={cardImageAlt(item)}
        loading="lazy"
        style={IMAGE_STYLE}
        className="w-full h-full object-cover"
      />
    )
  }
  return (
    <div className={PLACEHOLDER_CLASS}>
      <ImageIcon size={24} className="text-text-3" />
    </div>
  )
}

function Body({ item }: { item: CardGridItem }) {
  return (
    <div className="p-4 flex flex-col gap-1">
      {isPresent(item.category) && (
        <div className="text-[11px] font-semibold uppercase tracking-widest text-green mb-1">
          {item.category}
        </div>
      )}
      {isPresent(item.name) && (
        <h3 className="text-lg font-semibold text-text-0">{item.name}</h3>
      )}
      {isPresent(item.description) && <p className="text-sm text-text-2">{item.description}</p>}
      {isPresent(item.price) && (
        <div className="text-base font-semibold text-text-0 mt-1">{item.price}</div>
      )}
      {isPresent(item.ctaText) && isPresent(item.ctaUrl) && isAllowedUrl(item.ctaUrl) && (
        <a href={item.ctaUrl} className="text-sm font-medium text-green hover:text-green-dim">
          {item.ctaText}
        </a>
      )}
    </div>
  )
}

export function CardGridBlock({ block }: { block: BlockConfig }) {
  const props = block.props || {}
  const items = toCardGridItems(props.items)

  if (items.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-text-3 border border-dashed border-border-default rounded-lg">
        No product cards yet — add items in the properties panel.
      </div>
    )
  }

  return (
    <section className="px-6 md:px-10 py-12 md:py-16">
      <div className="max-w-6xl mx-auto">
        {isPresent(props.title) && (
          <h2 className="text-2xl font-semibold mb-2 text-center">{props.title}</h2>
        )}
        {isPresent(props.subtitle) && (
          <p className="text-text-2 mb-6 text-center">{props.subtitle}</p>
        )}
        <div className={GRID_CLASS}>
          {items.map((item, index) => (
            <article key={index} className={CARD_CLASS}>
              <div style={BOX_STYLE} className="bg-bg-3">
                <Media item={item} />
              </div>
              <Body item={item} />
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
