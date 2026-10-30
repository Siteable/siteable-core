import { useEffect, useState } from 'react'
import { facebookPageEmbedUrl } from '@/lib/facebook-page-embed'

const INPUT_CLASS =
  'w-full px-2 py-1.5 rounded border border-border-default bg-bg-2 text-text-0 text-xs outline-none focus:border-green'

/**
 * Text field that edits a local draft and commits to the host only on blur or
 * Enter (and only when the draft changed), so partial input never reaches the
 * store. Optionally shows an inline flag when the committed value cannot be
 * turned into a Page embed address.
 */
export function FacebookPageDraftField({
  label,
  value,
  onChange,
  showEmbedFlag,
}: {
  label: string
  value: unknown
  onChange(v: string): void
  showEmbedFlag?: boolean
}) {
  const [draft, setDraft] = useState(String(value ?? ''))

  // Resync when the stored value changes from outside (undo, page switch, agent edit).
  useEffect(() => {
    setDraft(String(value ?? ''))
  }, [value])

  const commit = () => {
    if (draft !== String(value ?? '')) onChange(draft)
  }

  const flagged =
    showEmbedFlag && String(value ?? '').trim() !== '' && facebookPageEmbedUrl(value) === null

  return (
    <div className="mb-2.5">
      <label className="block text-[11.5px] text-text-2 mb-1 font-medium">{label}</label>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit()
        }}
        className={INPUT_CLASS}
      />
      {flagged && (
        <p role="status" data-embed-flag className="text-[10.5px] text-status-red mt-1">
          This address may not show a Page timeline. Use a public Page link like https://www.facebook.com/yourpage.
        </p>
      )}
    </div>
  )
}
