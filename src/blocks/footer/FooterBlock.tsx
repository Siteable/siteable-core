import type { BlockConfig } from '../types'
import type { LinkItem } from '@/lib/block-metadata'
import { toLinkItem } from '@/lib/link-item'
import { isAllowedUrl } from '@/lib/url-policy'
import { defaultFooterColumns } from '@/lib/block-default-content'

interface FooterProps {
  logo: string
  logoImage?: string
  copyright: string
  links: (string | LinkItem)[]
  columns?: { title: string; links: (string | LinkItem)[] }[]
}

// Renders a link entry as an anchor when it carries a policy-passing href, and
// as the same non-anchor element otherwise — one rule for every footer variant.
function FooterLink({ link, className }: { link: string | LinkItem; className: string }) {
  const item = toLinkItem(link)
  if (item.href && isAllowedUrl(item.href)) {
    return <a href={item.href} className={className}>{item.label}</a>
  }
  return <span className={className}>{item.label}</span>
}

function FooterSimple({ props }: { props: FooterProps }) {
  return (
    <footer className="px-6 @md:px-10 py-8 border-t border-border-subtle">
      <div className="flex flex-col @lg:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {props.logoImage ? (
            <img src={props.logoImage} alt={props.logo} className="h-6 w-auto object-contain" />
          ) : (
            <div className="w-6 h-6 rounded-md bg-green/10 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-green" />
            </div>
          )}
          <span className="text-sm font-semibold text-text-1">{props.logo}</span>
        </div>

        <div className="flex items-center gap-4">
          {props.links.map((link, i) => (
            <FooterLink
              key={i}
              link={link}
              className="text-[12px] text-text-3 hover:text-text-1 transition-colors cursor-pointer"
            />
          ))}
        </div>

        <span className="text-[11px] text-text-3">{props.copyright}</span>
      </div>
    </footer>
  )
}

function FooterMultiColumn({ props }: { props: FooterProps }) {
  // ISS-005: fallback columns are the block-metadata contract (defaultFooterColumns),
  // shared with the prop normalizer so shape and render default can never drift.
  const columns = props.columns || defaultFooterColumns

  return (
    <footer className="px-6 @md:px-10 py-12 border-t border-border-subtle">
      <div className="grid grid-cols-2 @2xl:grid-cols-5 gap-8 mb-10">
        {/* Brand column */}
        <div className="col-span-2 @2xl:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            {props.logoImage ? (
              <img src={props.logoImage} alt={props.logo} className="h-7 w-auto object-contain" />
            ) : (
              <div className="w-7 h-7 rounded-md bg-green/10 flex items-center justify-center">
                <div className="w-3.5 h-3.5 rounded-full bg-green" />
              </div>
            )}
            <span className="text-sm font-semibold">{props.logo}</span>
          </div>
          <p className="text-[12px] text-text-3 leading-relaxed max-w-[200px]">
            Build beautiful websites with structured JSON config.
          </p>
        </div>

        {/* Link columns */}
        {columns.map((col, i) => (
          <div key={i}>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-2 mb-3">
              {col.title}
            </h4>
            <ul className="space-y-2">
              {col.links.map((link, j) => (
                <li key={j}>
                  <FooterLink
                    link={link}
                    className="text-[12.5px] text-text-3 hover:text-text-1 transition-colors cursor-pointer"
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="pt-6 border-t border-border-subtle flex flex-col @lg:flex-row items-center justify-between gap-3">
        <span className="text-[11px] text-text-3">{props.copyright}</span>
        <div className="flex gap-4">
          {props.links.map((link, i) => (
            <FooterLink
              key={i}
              link={link}
              className="text-[11px] text-text-3 hover:text-text-1 transition-colors cursor-pointer"
            />
          ))}
        </div>
      </div>
    </footer>
  )
}

function FooterMinimal({ props }: { props: FooterProps }) {
  return (
    <footer className="px-6 @md:px-10 py-6">
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-text-3">
        <span>{props.copyright}</span>
        {props.links.length > 0 && <span className="mx-1">|</span>}
        {props.links.map((link, i) => (
          <span key={i}>
            <FooterLink link={link} className="hover:text-text-1 transition-colors cursor-pointer" />
            {i < props.links.length - 1 && <span className="mx-1">|</span>}
          </span>
        ))}
      </div>
    </footer>
  )
}

export function FooterBlock({ block }: { block: BlockConfig }) {
  const props = block.props as unknown as FooterProps

  switch (block.variant) {
    case 'multi-column':
      return <FooterMultiColumn props={props} />
    case 'minimal':
      return <FooterMinimal props={props} />
    default:
      return <FooterSimple props={props} />
  }
}
