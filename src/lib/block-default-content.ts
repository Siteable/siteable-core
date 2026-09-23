/**
 * ISS-005 (class fix) — single source of truth for block default CONTENT.
 *
 * These literals were previously inline fallbacks inside block components
 * (or absent entirely), so the shape-driven prop normalizer had no contract
 * to coerce AI-returned values against. Each constant is value-identical to
 * the fallback it replaced: valid configs render byte-for-byte the same.
 *
 * block-metadata references them from defaultProps; the blocks import them
 * as render fallbacks (still needed for legacy persisted configs).
 */

// ISS-005 (review item 1): logocloud logos were inline-only; LogoPlaceholder
// does name.charAt(0) + renders {name} → object entries crash exactly like
// navbar links did.
export const defaultLogos = ['Vercel', 'Stripe', 'GitHub', 'Figma', 'Notion', 'Linear']

export const defaultFooterColumns: { title: string; links: string[] }[] = [
  { title: 'Product', links: ['Features', 'Pricing', 'Changelog', 'Roadmap'] },
  { title: 'Company', links: ['About', 'Blog', 'Careers', 'Press'] },
  { title: 'Resources', links: ['Documentation', 'API Reference', 'Guides', 'Community'] },
  { title: 'Legal', links: ['Privacy', 'Terms', 'Security', 'Cookie Policy'] },
]

export const defaultPricingTiers: {
  name: string
  price: string
  period?: string
  description?: string
  features: string[]
  cta: string
  featured?: boolean
}[] = [
  {
    name: 'Starter',
    price: '$0',
    period: '/month',
    description: 'For personal projects',
    features: ['1 website', '5 blocks', 'Basic export', 'Community support'],
    cta: 'Get Started',
  },
  {
    name: 'Pro',
    price: '$19',
    period: '/month',
    description: 'For professionals',
    features: ['Unlimited websites', 'All blocks', 'Custom domains', 'Priority support', 'Agent API access', 'Version history'],
    cta: 'Upgrade to Pro',
    featured: true,
  },
  {
    name: 'Team',
    price: '$49',
    period: '/month',
    description: 'For teams and agencies',
    features: ['Everything in Pro', 'Team collaboration', 'Custom components', 'SSO', 'Dedicated support'],
    cta: 'Contact Sales',
  },
]

export const defaultStatItems: { value: string; label: string }[] = [
  { value: '10K+', label: 'Sites built' },
  { value: '99.9%', label: 'Uptime' },
  { value: '50ms', label: 'Avg. response' },
  { value: '4.9/5', label: 'User rating' },
]

export const defaultFaqItems: { question: string; answer: string }[] = [
  { question: 'What is OpenPage?', answer: 'OpenPage is a visual website builder that uses structured JSON config as the source of truth. Both humans and AI agents can edit the same config to build beautiful websites.' },
  { question: 'How does the JSON config work?', answer: 'Every website is represented as a JSON document with blocks, styles, and content. The visual editor reads and writes this JSON, and agents can make surgical edits via the API.' },
  { question: 'Can I use my own components?', answer: 'Yes! OpenPage supports custom components. You can build your own blocks following our component schema and register them in the block registry.' },
  { question: 'Is it free to use?', answer: 'OpenPage offers a free tier for personal projects with up to 5 blocks. Pro and Team plans unlock unlimited blocks, custom domains, and priority support.' },
]

export const defaultTeamMembers: { name: string; role: string }[] = [
  { name: 'Alex Rivera', role: 'CEO & Founder' },
  { name: 'Jordan Lee', role: 'CTO' },
  { name: 'Sam Patel', role: 'Head of Design' },
  { name: 'Casey Morgan', role: 'Lead Engineer' },
]

// avatar:'' added vs the original inline literal (falsy → renders the initials
// fallback exactly as before) so the normalizer has a string shape for it.
export const defaultTestimonials: {
  name: string
  role: string
  quote: string
  rating?: number
  avatar?: string
}[] = [
  { name: 'Sarah Chen', role: 'CEO at TechCorp', quote: 'OpenPage completely changed how we build landing pages. The JSON config approach is genius.', rating: 5, avatar: '' },
  { name: 'Marcus Johnson', role: 'Lead Developer', quote: 'Finally, a tool where both designers and AI agents can work together seamlessly.', rating: 5, avatar: '' },
  { name: 'Emma Wilson', role: 'Product Manager', quote: 'We shipped our marketing site in half the time. The component library is incredible.', rating: 4, avatar: '' },
]

// src/caption:'' added vs the original { alt } literals — falsy renders the
// placeholder icon + skips the caption div, byte-identical output, and gives
// the normalizer full string shapes for every GalleryImage field.
export const defaultGalleryImages: { src?: string; alt?: string; caption?: string }[] = [
  { src: '', alt: 'Image 1', caption: '' }, { src: '', alt: 'Image 2', caption: '' }, { src: '', alt: 'Image 3', caption: '' },
  { src: '', alt: 'Image 4', caption: '' }, { src: '', alt: 'Image 5', caption: '' }, { src: '', alt: 'Image 6', caption: '' },
]

// Was inline in ImageBlock grid variant as { src: undefined, alt: '1' }.
// src promoted to '' — renders identically (falsy → Placeholder) but gives
// the normalizer a string contract for src. Type mirrors ImageBlock's
// declared { src?, alt? } so props.images || FALLBACK unions stay assignable.
export const defaultImageGridItems: { src?: string; alt: string }[] = [
  { src: '', alt: '1' }, { src: '', alt: '2' }, { src: '', alt: '3' }, { src: '', alt: '4' },
]
