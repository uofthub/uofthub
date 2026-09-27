/**
 * Draws the site's own link-preview image into web/public/og.png — the card a
 * shared link shows when its page has none of its own (see web/index.html).
 * Run it again after changing the card in src/lib/ogImage.ts:
 *
 *   pnpm --filter @uofthub/api og:site
 */
import { writeFileSync } from 'node:fs'
import { renderSiteCard } from '../lib/ogImage.js'

const out = new URL('../../../web/public/og.png', import.meta.url)
writeFileSync(out, await renderSiteCard())
console.log(`Wrote ${out.pathname}`)
