import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const pub = join(here, '..', 'public')
const svg = readFileSync(join(pub, 'icon.svg'))

// Standard icons (transparent-safe, dark tile is baked into the SVG).
await sharp(svg, { density: 384 }).resize(192, 192).png().toFile(join(pub, 'icon-192.png'))
await sharp(svg, { density: 384 }).resize(512, 512).png().toFile(join(pub, 'icon-512.png'))

// Maskable icon: pad to ~80% safe zone on the brand background so Android
// masks (circle/squircle) never clip the QR mark.
const inner = await sharp(svg, { density: 512 }).resize(410, 410).png().toBuffer()
await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#0f172a' },
})
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile(join(pub, 'icon-maskable-512.png'))

console.log('icons generated: icon-192.png, icon-512.png, icon-maskable-512.png')
