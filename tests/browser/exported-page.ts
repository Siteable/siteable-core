import type { Page } from '@playwright/test'
import { exportSiteToHTML } from '../../src/lib/export-html'
import { FIXTURE_BLOCKS, type Fixture } from '../helpers/behavior-test-table'

/** The exact bytes a visitor receives for one fixture, built by the real exporter. */
export function exportedHtml(fixture: Fixture): string {
  return exportSiteToHTML({ name: 'Site', blocks: FIXTURE_BLOCKS[fixture] })
}

/**
 * Load the exported document into a real browsing context.
 *
 * `load` (not `networkidle`) is deliberate: the page's only external resource is
 * the Tailwind Play CDN the exporter already ships, and a slow CDN should show
 * up as a failing layout assertion rather than an indefinite wait.
 */
export async function openExportedPage(page: Page, fixture: Fixture): Promise<void> {
  await page.setContent(exportedHtml(fixture), { waitUntil: 'load' })
}
