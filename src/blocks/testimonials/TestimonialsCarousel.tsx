import { Quote, Star } from 'lucide-react'
import { defaultTestimonials } from '@/lib/block-default-content'
import { CarouselRegion } from '../carousel/CarouselRegion'

/**
 * The testimonials carousel preview: one slide per item, in item order.
 *
 * The item card mirrors the default layout's card. It stays local on purpose:
 * `CarouselRegion` owns behavior and ARIA only, and importing the default
 * layout's card back into the carousel would make the two modules depend on
 * each other. The option wins over the static variant, which stays a separate
 * look.
 */

interface Testimonial {
  name: string
  role: string
  quote: string
  rating?: number
  avatar?: string
}

interface TestimonialsCarouselProps {
  title?: string
  subtitle?: string
  items?: Testimonial[]
}

/**
 * Mirror the exporter's two guards: an entry may be null or a primitive in an
 * imported config, and a non-string field is no text — never `undefined`,
 * `[object Object]` or a thrown `.split`.
 */
const entryOf = (raw: unknown): Testimonial =>
  (raw && typeof raw === 'object' ? (raw as Testimonial) : ({} as Testimonial))
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '')

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((position) => (
        <Star
          key={position}
          size={12}
          className={position <= rating ? 'text-status-yellow fill-status-yellow' : 'text-text-3'}
        />
      ))}
    </div>
  )
}

function TestimonialCard({ item }: { item: Testimonial }) {
  const name = textOf(item.name)
  const role = textOf(item.role)
  const quote = textOf(item.quote)
  const avatar = textOf(item.avatar)
  const rating = typeof item.rating === 'number' ? item.rating : 0
  return (
    <div className="bg-bg-2 border border-border-default rounded-xl p-5">
      <Quote size={20} className="text-green/30 mb-3" />
      <p className="text-[13px] text-text-1 leading-relaxed mb-4 italic">"{quote}"</p>
      {rating > 0 ? <Stars rating={rating} /> : null}
      <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border-subtle">
        {avatar ? (
          <img
            src={avatar}
            alt={name}
            className="w-9 h-9 rounded-full object-cover border border-border-default"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-bg-4 border border-border-default flex items-center justify-center text-[11px] font-semibold text-text-2">
            {name.split(' ').map((part) => part[0]).join('')}
          </div>
        )}
        <div>
          <div className="text-[12.5px] font-semibold">{name}</div>
          <div className="text-[11px] text-text-3">{role}</div>
        </div>
      </div>
    </div>
  )
}

export function TestimonialsCarousel({ props }: { props: TestimonialsCarouselProps }) {
  const items = props.items || defaultTestimonials
  return (
    <CarouselRegion
      // `??`, not `||`: an explicitly empty title is NO title in the exporter
      // too, so both environments name the region by `aria-label` instead of
      // inventing a heading the exported page does not have.
      title={props.title ?? 'What people say'}
      subtitle={props.subtitle}
      slides={items.map((item, index) => <TestimonialCard key={index} item={entryOf(item)} />)}
    />
  )
}
