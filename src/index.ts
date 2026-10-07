/**
 * @siteable/core — public barrel
 *
 * Surface every public named export from each module that ships with the package.
 * Consumers MUST import through this entry (or `@siteable/core/worker` for
 * server/edge code). `package.json` has an `exports` map that exposes only `.`,
 * `./worker`, `./src/styles.css` and `./package.json`, so a deep import like
 * `@siteable/core/src/store/configStore` is rejected by the resolver — it would
 * instantiate a second zustand singleton inside one app, breaking the
 * single-store invariant when both private app + package copy coexist.
 *
 * SC-001: enumerate every named export, with `validateSiteConfig` explicit.
 */

// ── Blocks ──────────────────────────────────────────────────────────────────
export {
  // types
  type BlockType,
  type BlockVariant,
  type BlockConfig,
  type ThemeConfig,
  type PageConfig,
  type SiteConfig,
} from './blocks/types'

export { RenderBlock } from './blocks/registry'
export { BlockWrapper } from './blocks/BlockWrapper'

// Individual block components (all variants consolidated into single Block components)
export { NavbarBlock } from './blocks/navbar/NavbarBlock'
export { HeroBlock } from './blocks/hero/HeroBlock'
export { FeaturesBlock } from './blocks/features/FeaturesBlock'
export { PricingBlock } from './blocks/pricing/PricingBlock'
export { CtaBlock } from './blocks/cta/CtaBlock'
export { FooterBlock } from './blocks/footer/FooterBlock'
export { TestimonialsBlock } from './blocks/testimonials/TestimonialsBlock'
export { StatsBlock } from './blocks/stats/StatsBlock'
export { FaqBlock } from './blocks/faq/FaqBlock'
export { TeamBlock } from './blocks/team/TeamBlock'
export { ContactBlock } from './blocks/contact/ContactBlock'
export { NewsletterBlock } from './blocks/newsletter/NewsletterBlock'
export { LogoCloudBlock } from './blocks/logocloud/LogoCloudBlock'
export { DividerBlock } from './blocks/divider/DividerBlock'
export { BannerBlock } from './blocks/banner/BannerBlock'
export { ContentBlock } from './blocks/content/ContentBlock'
export { ImageBlock } from './blocks/image/ImageBlock'
export { VideoBlock } from './blocks/video/VideoBlock'
export { GalleryBlock } from './blocks/gallery/GalleryBlock'

// ── Editor ──────────────────────────────────────────────────────────────────
export { AgentPanel } from './editor/AgentPanel'
export { Canvas } from './editor/Canvas'
export { CanvasEmpty } from './editor/CanvasEmpty'
export {
  CanvasToolbar,
  type CanvasToolbarProps,
} from './editor/CanvasToolbar'
export { DesignPanel } from './editor/DesignPanel'
export {
  EditorLayout,
  type EditorLayoutProps,
} from './editor/EditorLayout'
export { GenerationOverlay } from './editor/GenerationOverlay'
export { JsonDrawer } from './editor/JsonDrawer'
export { LayersPanel } from './editor/LayersPanel'
export { LeftSidebar } from './editor/LeftSidebar'
export { PropertiesPanel } from './editor/PropertiesPanel'
export { RightSidebar } from './editor/RightSidebar'
export { ShortcutsModal } from './editor/ShortcutsModal'
export { VersionHistory } from './editor/VersionHistory'

// ── Stores (zustand module singletons — single instance per app) ────────────
export {
  defaultConfig,
  useConfigStore,
} from './store/configStore'
export {
  useEditorStore,
  type Viewport,
} from './store/editorStore'

// ── Lib — block metadata ────────────────────────────────────────────────────
export {
  type BlockMeta,
  type LinkItem,
  blockMetadata,
  categories,
} from './lib/block-metadata'

// ── Lib — export-html (HTML serialization + helpers) ────────────────────────
export {
  type ExportSiteSettings,
  type ExportSiteOptions,
  exportSiteToHTML,
  exportToHTML,
  downloadHTML,
  previewHTML,
} from './lib/export-html'

// ── Lib — export-site-pages (multi-page export) ────────────────────────────
export { type PageDocument, exportSitePages } from './lib/export-site-pages'

// ── Lib — generate-site (Gemini + injectable server fallback) ───────────────
export {
  type GenerationResult,
  generateSiteConfig,
  validateSiteConfig,
} from './lib/generate-site'

// ── Lib — generation-prompt (system prompt for Gemini) ──────────────────────
export { GENERATION_PROMPT } from './lib/generation-prompt'

// ── Lib — markdown ──────────────────────────────────────────────────────────
export { renderMarkdown } from './lib/markdown'

// ── Lib — page-path (published URL per page + raw-path shape predicate) ─────
// Framework-free on purpose (NF-005): a server or edge runtime and a consuming
// app's import check can consume these two without pulling any UI module along.
export { normalizePagePaths, isValidPagePath } from './lib/page-path'

// ── Lib — url policy (shared href/src allow-list, FR-004) ───────────────────
export { isAllowedUrl, type UrlPolicyOptions } from './lib/url-policy'

// ── Lib — video embed (one embeddability decision for editor, exporter, consumers)
export { extractYouTubeId, extractVimeoId, videoEmbedUrl } from './lib/video-embed'

// ── Lib — templates (smart-fallback site templates) ─────────────────────────
export {
  templateMeta,
  buildTemplate,
  getTemplateForPrompt,
} from './lib/templates'

// ── Lib — theme-presets (10 themes + utilities) ─────────────────────────────
export {
  defaultTheme,
  type ThemePreset,
  themePresets,
  resolveTheme,
  hexToRgb,
  themeToCSS,
  googleFontOptions,
} from './lib/theme-presets'

// ── Lib — react hooks ───────────────────────────────────────────────────────
export { useGoogleFonts } from './lib/useGoogleFonts'
export { useScrollReveal } from './lib/useScrollReveal'

// ── Settings (extracted components) ─────────────────────────────────────────
export { GeminiKeyInputField } from './settings/GeminiKeyInputField'
