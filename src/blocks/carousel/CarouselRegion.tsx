import { useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * The opt-in carousel, mirrored in the editor preview.
 *
 * The same ARIA contract the exported page renders (`region` with
 * `aria-roledescription="carousel"`, one `group` slide per item labelled
 * `"{n} of {m}"`, two controls named by `aria-label`) is produced here with
 * React state instead of the shared runtime, so a document that holds both the
 * editor and an exported page never handles one interaction twice — this
 * markup carries no `data-sb-*` hook.
 *
 * The slide class list carries no display utility and no transition, so the
 * `hidden` attribute alone shows one slide at a time. ArrowLeft/ArrowRight move
 * one slide from the shown position without wrapping, each control is
 * `disabled` at its end of the list, and — like the export runtime — focus moves
 * to the other control when the activated one becomes disabled.
 */

const SLIDE_CLASS = 'rounded-xl focus:outline-none'
const CONTROL_CLASS =
  'min-h-[40px] min-w-[40px] w-10 h-10 rounded-full border border-border-default bg-bg-2 flex items-center justify-center text-text-2 hover:text-text-0 hover:border-border-hover disabled:opacity-40 disabled:cursor-not-allowed'

interface CarouselRegionProps {
  /** Unknown on purpose: the JSON drawer can store any type in a prop. */
  title?: unknown
  subtitle?: unknown
  slides: ReactNode[]
}

export function CarouselRegion({ title, subtitle, slides }: CarouselRegionProps) {
  const [index, setIndex] = useState(0)
  const headingId = useId()
  const prevRef = useRef<HTMLButtonElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const count = slides.length
  // Items can be edited away while the preview is open: clamp instead of
  // reading an index the array no longer has.
  const current = Math.min(index, count - 1)
  // The exporter reads every text prop through `textOf`; a non-string becomes
  // no text instead of throwing on `.trim()` or rendering an object.
  const titleText = typeof title === 'string' ? title : ''
  const subtitleText = typeof subtitle === 'string' ? subtitle : ''
  const hasTitle = titleText.trim() !== ''
  const hasSubtitle = subtitleText !== ''

  // A move stops at both ends instead of wrapping. When the control the visitor
  // just used becomes disabled, focus moves to the other control of this
  // carousel — the same recovery the export runtime performs.
  const move = (to: number, which: 'prev' | 'next') => {
    if (to < 0 || to > count - 1) return
    setIndex(to)
    const disabled = (which === 'prev' && to === 0) || (which === 'next' && to === count - 1)
    if (disabled) (which === 'prev' ? nextRef : prevRef).current?.focus()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const to = current + (event.key === 'ArrowRight' ? 1 : -1)
    if (to < 0 || to > count - 1) return
    event.preventDefault()
    const target = event.target
    const button = target instanceof Element ? target.closest('button') : null
    if (button === prevRef.current) move(to, 'prev')
    else if (button === nextRef.current) move(to, 'next')
    else setIndex(to)
  }

  return (
    <section
      role="region"
      aria-roledescription="carousel"
      {...(hasTitle ? { 'aria-labelledby': headingId } : { 'aria-label': 'Carousel' })}
      onKeyDown={onKeyDown}
      className="px-6 @md:px-10 py-16 @md:py-20"
    >
      {(hasTitle || hasSubtitle) && (
        <div className="text-center mb-10">
          {hasTitle && (
            <h2 id={headingId} className="text-2xl @md:text-3xl font-bold tracking-tight mb-2">
              {titleText}
            </h2>
          )}
          {hasSubtitle && <p className="text-text-2 text-sm max-w-lg mx-auto">{subtitleText}</p>}
        </div>
      )}

      <div className="relative">
        {slides.map((slide, position) => (
          <div
            key={position}
            role="group"
            aria-roledescription="slide"
            aria-label={`${position + 1} of ${count}`}
            hidden={position !== current}
            className={SLIDE_CLASS}
          >
            {slide}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-4 mt-6">
        <button
          ref={prevRef}
          type="button"
          aria-label="Previous slide"
          disabled={current === 0}
          onClick={() => move(current - 1, 'prev')}
          className={CONTROL_CLASS}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          ref={nextRef}
          type="button"
          aria-label="Next slide"
          disabled={current === count - 1}
          onClick={() => move(current + 1, 'next')}
          className={CONTROL_CLASS}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </section>
  )
}
