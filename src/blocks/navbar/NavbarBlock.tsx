import type { BlockConfig } from '../types'
import type { LinkItem } from '@/lib/block-metadata'
import { toLinkItem } from '@/lib/link-item'
import { isAllowedUrl } from '@/lib/url-policy'
import { useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Menu, X } from 'lucide-react'

interface NavbarProps {
  logo: string
  links: (string | LinkItem)[]
  ctaText: string
  ctaUrl?: string
}

const CTA_BUTTON_CLASS = 'px-4 py-2 rounded-lg bg-green text-black text-[13px] font-semibold hover:bg-green-dim transition-colors'

function NavLink({ link }: { link: string | LinkItem }) {
  const item = toLinkItem(link)
  const className = 'text-[13px] text-text-2 hover:text-text-0 transition-colors cursor-pointer'
  if (item.href && isAllowedUrl(item.href)) {
    return <a href={item.href} className={className}>{item.label}</a>
  }
  return <span className={className}>{item.label}</span>
}

const MENU_BUTTON_CLASS = '@2xl:hidden w-9 h-9 rounded-lg border border-border-default flex items-center justify-center text-text-2 hover:text-text-0 hover:bg-bg-3 transition-colors'

/**
 * Mobile menu state shared by both variants. Escape closes an open panel,
 * returns focus to the toggle and stops propagating so editor window-level
 * shortcuts do not also fire; a closed panel leaves Escape untouched.
 */
function useMobileMenu() {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !open) return
    event.stopPropagation()
    setOpen(false)
    buttonRef.current?.focus()
  }

  return { open, toggle: () => setOpen((value) => !value), panelId, buttonRef, onKeyDown }
}

/** Toggle for the link panel below @2xl, shared by both variants. */
function MobileMenuButton({
  open,
  onToggle,
  panelId,
  buttonRef,
}: {
  open: boolean
  onToggle: () => void
  panelId: string
  buttonRef: RefObject<HTMLButtonElement | null>
}) {
  return (
    <button
      type="button"
      ref={buttonRef}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label="Toggle menu"
      onClick={onToggle}
      className={MENU_BUTTON_CLASS}
    >
      {open ? <X size={16} /> : <Menu size={16} />}
    </button>
  )
}

/**
 * Stacked link panel. Always mounted, hidden through the `hidden` attribute so
 * the toggle can reference an existing element while closed and no layout
 * transition runs. The inline `display` keeps it hidden even where an author
 * `.flex` rule outranks the user-agent `[hidden]` rule (e.g. preflight off).
 */
function MobileMenuPanel({
  id,
  hidden,
  links,
  ctaText,
  ctaUrl,
}: {
  id: string
  hidden: boolean
  links: (string | LinkItem)[]
  ctaText: string
  ctaUrl?: string
}) {
  return (
    <div id={id} hidden={hidden} style={hidden ? { display: 'none' } : undefined} className="@2xl:hidden basis-full flex flex-col gap-3 pt-4">
      {links.map((link, i) => (
        <NavLink key={i} link={link} />
      ))}
      {ctaUrl && isAllowedUrl(ctaUrl) ? (
        <a href={ctaUrl} className={`${CTA_BUTTON_CLASS} text-center`}>{ctaText}</a>
      ) : (
        <button className={CTA_BUTTON_CLASS}>{ctaText}</button>
      )}
    </div>
  )
}

function NavbarDefault({ props }: { props: NavbarProps }) {
  const { logo, links = [], ctaText, ctaUrl } = props
  const menu = useMobileMenu()

  return (
    <nav onKeyDown={menu.onKeyDown} className="px-6 @md:px-10 py-4 flex flex-wrap items-center justify-between">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-green/10 flex items-center justify-center">
          <div className="w-4 h-4 rounded-full bg-green" />
        </div>
        <span className="font-semibold text-[15px] text-text-0 tracking-tight">{logo}</span>
      </div>

      {/* Desktop nav links */}
      <div className="hidden @2xl:flex items-center gap-6">
        {links.map((link, i) => (
          <NavLink key={i} link={link} />
        ))}
      </div>

      {/* CTA + mobile menu */}
      <div className="flex items-center gap-3">
        {/* Same breakpoint as the inline links and as the centered variant: below @2xl the CTA lives only in the mobile panel. */}
        <div className="hidden @2xl:block">
          {ctaUrl && isAllowedUrl(ctaUrl) ? (
            <a href={ctaUrl} className={CTA_BUTTON_CLASS}>{ctaText}</a>
          ) : (
            <button className={CTA_BUTTON_CLASS}>{ctaText}</button>
          )}
        </div>
        <MobileMenuButton open={menu.open} onToggle={menu.toggle} panelId={menu.panelId} buttonRef={menu.buttonRef} />
      </div>
      <MobileMenuPanel id={menu.panelId} hidden={!menu.open} links={links} ctaText={ctaText} ctaUrl={ctaUrl} />
    </nav>
  )
}

function NavbarCentered({ props }: { props: NavbarProps }) {
  const { logo, links = [], ctaText, ctaUrl } = props
  const mid = Math.ceil(links.length / 2)
  const leftLinks = links.slice(0, mid)
  const rightLinks = links.slice(mid)
  const menu = useMobileMenu()

  return (
    <nav onKeyDown={menu.onKeyDown} className="px-6 @md:px-10 py-4 flex flex-wrap items-center justify-between">
      {/* Left links */}
      <div className="hidden @2xl:flex items-center gap-6 flex-1">
        {leftLinks.map((link, i) => (
          <NavLink key={i} link={link} />
        ))}
      </div>

      {/* Center logo */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-green/10 flex items-center justify-center">
          <div className="w-4 h-4 rounded-full bg-green" />
        </div>
        <span className="font-semibold text-[15px] text-text-0 tracking-tight">{logo}</span>
      </div>

      {/* Right links + CTA */}
      <div className="hidden @2xl:flex items-center gap-6 flex-1 justify-end">
        {rightLinks.map((link, i) => (
          <NavLink key={i} link={link} />
        ))}
        {ctaUrl && isAllowedUrl(ctaUrl) ? (
          <a href={ctaUrl} className={`${CTA_BUTTON_CLASS} ml-2`}>{ctaText}</a>
        ) : (
          <button className={`${CTA_BUTTON_CLASS} ml-2`}>{ctaText}</button>
        )}
      </div>

      {/* Mobile menu */}
      <MobileMenuButton open={menu.open} onToggle={menu.toggle} panelId={menu.panelId} buttonRef={menu.buttonRef} />
      <MobileMenuPanel id={menu.panelId} hidden={!menu.open} links={links} ctaText={ctaText} ctaUrl={ctaUrl} />
    </nav>
  )
}

export function NavbarBlock({ block }: { block: BlockConfig }) {
  const props = block.props as unknown as NavbarProps

  switch (block.variant) {
    case 'centered':
      return <NavbarCentered props={props} />
    default:
      return <NavbarDefault props={props} />
  }
}
