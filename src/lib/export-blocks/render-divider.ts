import type { BlockConfig } from '@/blocks/types'

/**
 * `divider` block (variants: line default, space, dots).
 *
 * `height` is coerced with `Number(...) || 60`, so a non-numeric prop (e.g. an
 * injected string) degrades to the default instead of reaching the `style`
 * attribute. `width` is mapped through a fixed allow-list to a class name.
 */
export function renderDivider(block: BlockConfig): string {
  const height = Number(block.props.height) || 60
  const width = typeof block.props.width === 'string' ? block.props.width : 'full'
  const widthClass =
    width === 'narrow' ? 'max-w-32' : width === 'centered' ? 'max-w-xs' : 'w-full'

  if (block.variant === 'space') {
    return `  <div style="height: ${height}px"></div>`
  }

  if (block.variant === 'dots') {
    return `  <div class="flex items-center justify-center gap-2 py-8" style="min-height: ${height}px"><span class="w-1.5 h-1.5 rounded-full bg-text-3"></span><span class="w-1.5 h-1.5 rounded-full bg-text-3"></span><span class="w-1.5 h-1.5 rounded-full bg-text-3"></span></div>`
  }

  // line (default)
  return `  <div class="flex items-center justify-center" style="min-height: ${height}px"><div class="${widthClass} mx-auto border-t border-border-default"></div></div>`
}
