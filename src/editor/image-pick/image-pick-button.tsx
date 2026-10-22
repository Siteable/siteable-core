import { ImagePlus, LoaderCircle } from 'lucide-react'

/** Small icon button that asks the host to choose an image for one field or row. */
export function ImagePickButton({
  label,
  pending,
  disabled,
  onClick,
}: {
  label: string
  pending: boolean
  disabled?: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      data-image-pick=""
      aria-label={`Choose image for ${label}`}
      aria-busy={pending || undefined}
      disabled={pending || disabled}
      onClick={onClick}
      className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded border border-border-default bg-bg-2 text-text-1 hover:text-text-0 hover:border-green disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? <LoaderCircle size={14} className="animate-spin" /> : <ImagePlus size={14} />}
    </button>
  )
}
