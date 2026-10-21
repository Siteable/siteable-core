import { ImageIcon } from 'lucide-react'
import { CarouselRegion } from '../carousel/CarouselRegion'

/**
 * The gallery carousel preview: one slide per image, in image order. The
 * variant is ignored — the slide is the frame, so grid and masonry both render
 * the carousel. The card mirrors the default layout's card and stays local so
 * `CarouselRegion` owns behavior and ARIA only.
 *
 * An empty or missing source renders the same placeholder the default layout
 * uses, so the preview makes no network request for an empty fixture.
 */

interface GalleryImage {
  src?: string
  alt?: string
  caption?: string
}

/** The exporter's two guards: a hostile entry becomes empty text, never a throw. */
const entryOf = (raw: unknown): GalleryImage =>
  (raw && typeof raw === 'object' ? (raw as GalleryImage) : {})
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '')

function SlideCard({ image }: { image: GalleryImage }) {
  const src = textOf(image.src)
  const alt = textOf(image.alt)
  const caption = textOf(image.caption)
  return (
    <div className="rounded-lg overflow-hidden border border-border-default">
      {src ? (
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full min-h-[140px] bg-gradient-to-br from-bg-3 to-bg-4 flex items-center justify-center">
          <ImageIcon size={24} className="text-text-3" />
        </div>
      )}
      {caption && (
        <div className="px-3 py-2 bg-bg-2 text-[11px] text-text-2">{caption}</div>
      )}
    </div>
  )
}

export function GalleryCarousel({ title, images }: { title?: string; images: GalleryImage[] }) {
  return (
    <CarouselRegion
      title={title ?? ''}
      slides={images.map((image, index) => <SlideCard key={index} image={entryOf(image)} />)}
    />
  )
}
