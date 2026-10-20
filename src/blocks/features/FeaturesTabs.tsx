import { useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

/**
 * The opt-in tab layout for a features block, mirrored in the editor preview.
 *
 * The same ARIA contract the exported page uses (`tablist` / `tab` /
 * `tabpanel`) is rendered here with React state instead of the shared runtime,
 * so a document that holds both the editor and an exported page never handles
 * one interaction twice — this markup carries no `data-sb-*` hook.
 *
 * A tab is labeled with the item title, or `Tab N` (the item's 1-based
 * position) when the title is empty or only whitespace, so an unnamed tab is
 * never an empty label. Panels carry no transition class and no display
 * utility: the `hidden` attribute alone shows one panel at a time.
 */

interface TabItem {
  title?: string
  description?: string
}

interface FeaturesTabsProps {
  label?: string
  title?: string
  subtitle?: string
  items: TabItem[]
}

const TAB_CLASS =
  'min-h-[40px] min-w-[40px] px-4 py-2 rounded-lg border border-border-default bg-bg-2 text-sm font-medium text-text-2 transition-colors hover:border-border-hover aria-selected:border-green aria-selected:text-green aria-selected:bg-green/10'
const PANEL_CLASS = 'max-w-2xl mx-auto bg-bg-2 border border-border-default rounded-xl p-5'

function labelFor(item: TabItem | null | undefined, position: number): string {
  const title = typeof item?.title === 'string' ? item.title : ''
  return title.trim() ? title : `Tab ${position}`
}

export function FeaturesTabs({ props }: { props: FeaturesTabsProps }) {
  const [selected, setSelected] = useState(0)
  const base = useId()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const items = props.items
  const count = items.length
  // Items can be edited away while the preview is open: clamp instead of
  // reading a selection index the array no longer has.
  const current = Math.min(selected, count - 1)

  const move = (index: number) => {
    setSelected(index)
    buttons.current[index]?.focus()
  }

  // The index comes from the focused tab, like the export runtime reads it
  // from the event target — not from React state, which a programmatic focus
  // does not move.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = buttons.current.indexOf(event.target as HTMLButtonElement)
    if (index < 0 || count === 0) return
    const next =
      event.key === 'ArrowRight' ? (index + 1) % count
        : event.key === 'ArrowLeft' ? (index - 1 + count) % count
          : event.key === 'Home' ? 0
            : event.key === 'End' ? count - 1
              : -1
    if (next < 0) return
    event.preventDefault()
    move(next)
  }

  return (
    <section className="px-6 @md:px-10 py-16 @md:py-20">
      <div className="text-center mb-10">
        {props.label && (
          <div className="text-[11px] font-semibold uppercase tracking-widest text-green mb-2">
            {props.label}
          </div>
        )}
        <h2 className="text-2xl @md:text-3xl font-bold tracking-tight mb-2">{props.title}</h2>
        {props.subtitle && (
          <p className="text-text-2 text-sm max-w-lg mx-auto">{props.subtitle}</p>
        )}
      </div>

      <div role="tablist" className="flex flex-wrap justify-center gap-2 mb-6" onKeyDown={onKeyDown}>
        {items.map((item, index) => (
          <button
            key={index}
            ref={(element) => { buttons.current[index] = element }}
            type="button"
            role="tab"
            id={`${base}-t${index}`}
            aria-controls={`${base}-p${index}`}
            aria-selected={index === current}
            tabIndex={index === current ? 0 : -1}
            onClick={() => setSelected(index)}
            className={TAB_CLASS}
          >
            {labelFor(item, index + 1)}
          </button>
        ))}
      </div>

      {items.map((item, index) => (
        <div
          key={index}
          role="tabpanel"
          id={`${base}-p${index}`}
          aria-labelledby={`${base}-t${index}`}
          tabIndex={0}
          hidden={index !== current}
          className={PANEL_CLASS}
        >
          <p className="text-[12.5px] text-text-2 leading-relaxed">{item?.description ?? ''}</p>
        </div>
      ))}
    </section>
  )
}
