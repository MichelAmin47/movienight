// Renders the app icon (popcorn on the accent color) to public/.
//
//   node scripts/generate-icons.mjs
//
// Needs Playwright with Chromium, which is not a project dependency: it is
// preinstalled in Claude Code cloud sessions, elsewhere use
// `npx -p playwright node scripts/generate-icons.mjs`. The generated files are
// committed, so this only has to run when the design changes.
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

// `require` also finds a globally installed Playwright (NODE_PATH); `import` does not.
const { chromium } = createRequire(import.meta.url)('playwright')

const ACCENT = '#e2574c'
const STRIPE = '#c9443a'
const CREAM = '#fff6dc'
const BUTTER = '#fde9b8'

// The drawing on a 64×64 grid; its visual centre is (32, 31).
const popcorn = `
  <circle cx="21" cy="22" r="8" fill="${BUTTER}"/>
  <circle cx="43" cy="22" r="8" fill="${BUTTER}"/>
  <circle cx="27" cy="15" r="7" fill="${CREAM}"/>
  <circle cx="38" cy="15" r="7" fill="${BUTTER}"/>
  <circle cx="32" cy="20" r="9" fill="${CREAM}"/>
  <path d="M15 26h34l-5 28H20z" fill="${CREAM}"/>
  <path d="M22.5 26l2.2 28h5l-1.2-28zM35.5 26l-1.2 28h5l2.2-28z" fill="${STRIPE}"/>`

/** `scale` is the size of the drawing; `radius` rounds the corners (0 = full bleed). */
function icon(scale, radius) {
  const x = 256 - 32 * scale
  const y = 256 - 31 * scale
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="${ACCENT}"/>
  <g transform="translate(${x} ${y}) scale(${scale})">${popcorn}
  </g>
</svg>
`
}

const regular = icon(6.6, 112)
// Maskable: full bleed, drawing inside the safe zone (a circle of 80% of the width).
const maskable = icon(5.6, 0)
// iOS rounds the corners itself and does not want transparency.
const apple = icon(6.6, 0)

const targets = [
  { file: 'icons/icon-192.png', svg: regular, size: 192 },
  { file: 'icons/icon-512.png', svg: regular, size: 512 },
  { file: 'icons/icon-maskable-512.png', svg: maskable, size: 512 },
  { file: 'apple-touch-icon.png', svg: apple, size: 180 },
  { file: 'favicon-48.png', svg: regular, size: 48 },
]

const out = new URL('../public/', import.meta.url)
await mkdir(new URL('icons/', out), { recursive: true })
await writeFile(new URL('favicon.svg', out), regular)

const browser = await chromium.launch()
for (const { file, svg, size } of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  )
  await writeFile(new URL(file, out), await page.screenshot({ omitBackground: true }))
  await page.close()
}
await browser.close()
