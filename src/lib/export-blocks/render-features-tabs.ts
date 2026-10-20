import type { BlockConfig } from '@/blocks/types'
import { escapeHtml } from '@/lib/html-escape'
import { prop } from '@/lib/render-prop'
import { TAB_ID_PREFIX } from '@/lib/export-behavior-runtime'

/**
 * `features` block rendered as a tab set — the opt-in `display: "tabs"` layout.
 *
 * One tab per item labeled with the item title (or `Tab N`, the item's 1-based
 * position, when the title is empty or only whitespace, so an unnamed tab is
 * never an empty label for a screen reader or a no-script reader), one panel
 * per item holding the item description and leading with a `hidden` heading the
 * no-script stylesheet reveals. The shared runtime selects a panel through
 * `data-sb-tab` / `aria-controls`, and the panel is hidden through the `hidden`
 * ATTRIBUTE alone — so the panel class list must carry no display utility and no
 * transition: under the stylesheet CDN an author `display` utility outranks the
 * user agent's `[hidden]` rule, which would leave every panel visible.
 *
 * `setId` is supplied by the exporter's per-document counter (`sb_tabs_N`), so
 * ids are deterministic, unique per document even when two blocks share one
 * block id, and content-free — nothing from user input reaches an attribute.
 *
 * This module is reached through the exporter's worker closure walk; it must not
 * import the editor layer or a UI framework.
 */

const TAB_CLASS =
  'min-h-[40px] min-w-[40px] px-4 py-2 rounded-lg border border-border-default bg-bg-2 text-sm font-medium text-text-2 transition-colors hover:border-border-hover aria-selected:border-green aria-selected:text-green aria-selected:bg-green/10'
/** No display utility and no transition — see the class-list note above. */
const PANEL_CLASS = 'max-w-2xl mx-auto bg-bg-2 border border-border-default rounded-xl p-5'

interface FeatureItem {
  title?: unknown
  description?: unknown
}
/** The label: the item title, or `Tab N` at its position when the title is blank. */
function itemLabel(raw: unknown, position: number): string {
  // Verbatim when it has non-whitespace content; a non-string title counts as blank.
  const title = typeof raw === 'string' ? raw : ''
  return title.trim() ? title : `Tab ${position}`
}

/** An entry may be null or a primitive in AI-generated props; read defensively. */
function entry(raw: unknown): FeatureItem {
  return raw && typeof raw === 'object' ? (raw as FeatureItem) : {}
}

export function renderFeaturesTabs(block: BlockConfig, setId: string): string {
  const optionLabel = prop<string>(block.props, 'label', '')
  const title = escapeHtml(prop(block.props, 'title', ''))
  const subtitle = prop<string>(block.props, 'subtitle', '')
  const items = prop<unknown[]>(block.props, 'items', [])

  const labelHtml = optionLabel
    ? `        <div class="text-[11px] font-semibold uppercase tracking-widest text-green mb-2">${escapeHtml(optionLabel)}</div>`
    : ''
  const subtitleHtml = subtitle
    ? `        <p class="text-text-2 text-sm max-w-lg mx-auto">${escapeHtml(subtitle)}</p>`
    : ''

  // The set id is content-free by construction, but escaped like every other
  // attribute value so the guarantee does not depend on that construction.
  const set = escapeHtml(setId)

  const tabs: string[] = []
  const panels: string[] = []

  items.forEach((raw, index) => {
    const { title: rawTitle, description } = entry(raw)
    const n = index + 1
    const tabLabel = escapeHtml(itemLabel(rawTitle, n))

    tabs.push(
      `        <button type="button" role="tab" data-sb-tab id="${set}_t${n}" aria-controls="${set}_p${n}" aria-selected="${n === 1 ? 'true' : 'false'}" tabindex="${n === 1 ? '0' : '-1'}" class="${TAB_CLASS}">${tabLabel}</button>`
    )

    panels.push(
      `      <div role="tabpanel" data-sb-tab-panel id="${set}_p${n}" aria-labelledby="${set}_t${n}" tabindex="0"${n === 1 ? '' : ' hidden'} class="${PANEL_CLASS}">
        <h3 data-sb-tab-title hidden class="text-sm font-semibold mb-1">${tabLabel}</h3>
        <p class="text-[12.5px] text-text-2 leading-relaxed">${escapeHtml(description ?? '')}</p>
      </div>`
    )
  })

  return `  <section class="px-6 md:px-10 py-16 md:py-20">
      <div class="text-center mb-10">
${labelHtml}
        <h2 class="text-2xl md:text-3xl font-bold tracking-tight mb-2">${title}</h2>
${subtitleHtml}
      </div>
      <div role="tablist" data-sb-tablist class="flex flex-wrap justify-center gap-2 mb-6">
${tabs.join('\n')}
      </div>
${panels.join('\n')}
  </section>`
}

/** The per-document set id for the n-th tab set on a page. */
export const tabSetId = (sequence: number): string => `${TAB_ID_PREFIX}${sequence}`
