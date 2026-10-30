import { ThumbsUp } from 'lucide-react'
import type { BlockConfig } from '../types'
import { clampFacebookPageHeight, facebookPageEmbedUrl } from '@/lib/facebook-page-embed'

const FRAME_WIDTH = 340
// The bordered container is 2 px wider than the frame so its content box,
// which the frame fills, is exactly the plugin width (1 px border each side).
const CONTAINER_MAX_WIDTH = FRAME_WIDTH + 2

function Placeholder() {
  return (
    <div
      className="w-full aspect-video bg-gradient-to-br from-bg-3 to-bg-4 rounded-lg flex items-center justify-center"
      style={{ maxWidth: CONTAINER_MAX_WIDTH, margin: '0 auto' }}
    >
      <div className="w-14 h-14 rounded-full bg-bg-5/50 border border-border-default flex items-center justify-center">
        <ThumbsUp size={24} className="text-text-3" />
      </div>
    </div>
  )
}

/**
 * Facebook Page timeline embed. The iframe src comes ONLY from the shared
 * `facebookPageEmbedUrl` function (never the raw stored value); when it returns
 * null no iframe is rendered and a placeholder shows instead. Markup mirrors
 * the exporter's output.
 */
export function FacebookPageBlock({ block }: { block: BlockConfig }) {
  const { props } = block
  const title = typeof props.title === 'string' ? props.title : ''
  const embedUrl = facebookPageEmbedUrl(props.url, props.height)
  const height = clampFacebookPageHeight(props.height)

  return (
    <div className="px-6 py-12 @lg:px-16 @lg:py-16">
      {title && <h2 className="reveal-fade-up reveal-d1 text-xl font-display font-semibold mb-4 text-center">{title}</h2>}
      {embedUrl ? (
        <div
          className="reveal-scale reveal-d2 w-full rounded-lg overflow-hidden border border-border-default"
          style={{ maxWidth: CONTAINER_MAX_WIDTH, margin: '0 auto' }}
        >
          <iframe
            src={embedUrl}
            title={title || 'Facebook Page'}
            width={FRAME_WIDTH}
            height={height}
            style={{ display: 'block', width: '100%', border: 0 }}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <Placeholder />
      )}
    </div>
  )
}
