import { createRoot } from 'react-dom/client'
import { QRCodeSVG } from 'qrcode.react'

export interface LocationLabel {
  id: number
  code: string
  aisle?: string
  bay?: string
  level?: string
  bin?: string
}

function LabelCard({ l }: { l: LocationLabel }) {
  const meta = [l.aisle && `Aisle ${l.aisle}`, l.bay && `Bay ${l.bay}`, l.level && `Lvl ${l.level}`, l.bin && `Bin ${l.bin}`]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="qr-card">
      <QRCodeSVG value={l.code} size={140} level="M" includeMargin />
      <div className="qr-code">{l.code}</div>
      {meta ? <div className="qr-meta">{meta}</div> : null}
    </div>
  )
}

/** Opens a print window with QR labels for the given locations (payload = location code). */
export function printLocationLabels(labels: LocationLabel[], title = 'Location QR Labels') {
  if (!labels.length) return

  const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700')
  if (!w) {
    alert('Allow pop-ups to print QR labels')
    return
  }

  w.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; margin: 16px; color: #111; }
  h1 { font-size: 16px; margin: 0 0 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .qr-card { border: 1px solid #ccc; border-radius: 8px; padding: 12px; text-align: center; break-inside: avoid; page-break-inside: avoid; }
  .qr-code { font-weight: 700; font-size: 14px; margin-top: 8px; letter-spacing: 0.02em; }
  .qr-meta { font-size: 11px; color: #555; margin-top: 4px; }
  @media print { body { margin: 8px; } h1 { display: none; } }
</style></head><body>
  <h1>${escapeHtml(title)} (${labels.length})</h1>
  <div id="root" class="grid"></div>
</body></html>`)
  w.document.close()

  const rootEl = w.document.getElementById('root')
  if (!rootEl) return
  const root = createRoot(rootEl)
  root.render(
    <>
      {labels.map(l => <LabelCard key={l.id} l={l} />)}
    </>,
  )
  // Wait a tick for SVG paint, then print
  setTimeout(() => {
    w.focus()
    w.print()
  }, 400)
}

export function LocationQRPreview({ code, size = 128 }: { code: string; size?: number }) {
  if (!code) return null
  return (
    <div className="inline-flex flex-col items-center gap-1">
      <QRCodeSVG value={code} size={size} level="M" includeMargin />
      <span className="text-xs font-medium">{code}</span>
    </div>
  )
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
