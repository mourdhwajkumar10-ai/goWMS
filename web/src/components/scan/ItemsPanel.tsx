import type { Box } from './BoxQueue'

type Props = {
  boxes: Box[]
  /** When true, Received uses scannedUnits (item verification) instead of dock-counted box capacity */
  itemMode?: boolean
  complete?: boolean
  /** Prefer live session stats when box aggregates are empty / stale */
  expectedOverride?: number
  receivedOverride?: number
  onFinalizePutaway?: () => void
  finalizing?: boolean
  onPartialClose?: () => void
  partialClosing?: boolean
  canPartialClose?: boolean
}

export default function ItemsPanel({
  boxes,
  itemMode = false,
  complete = false,
  expectedOverride,
  receivedOverride,
  onFinalizePutaway,
  finalizing = false,
  onPartialClose,
  partialClosing = false,
  canPartialClose = false,
}: Props) {
  const counted = boxes.filter((b) => b.status === 'counted')
  const damaged = boxes.filter((b) => b.status === 'damaged')
  const flagged = boxes.filter((b) => b.status === 'flagged')
  const units = (list: Box[]) => list.reduce((sum, b) => sum + (Number(b.units) || 0), 0)
  const scanned = (list: Box[]) => list.reduce((sum, b) => sum + (Number(b.scannedUnits) || 0), 0)
  const fromBoxesExpected = units(boxes)
  const fromBoxesReceived = itemMode ? scanned(boxes) : units(counted)
  const expected = expectedOverride != null && expectedOverride > 0 ? expectedOverride : fromBoxesExpected
  const received = receivedOverride != null && receivedOverride > 0 ? receivedOverride : fromBoxesReceived
  const shortUnits = Math.max(0, expected - received)
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {complete && (
        <div
          className="scan-badge ok"
          style={{ alignSelf: 'stretch', justifyContent: 'center', padding: '12px 16px', fontSize: 14 }}
          role="status"
        >
          Item verification complete — post stock to release putaway
        </div>
      )}
      {!complete && itemMode && (
        <div
          className="scan-badge warn"
          style={{ alignSelf: 'stretch', justifyContent: 'center', padding: '10px 14px', fontSize: 13 }}
          role="status"
        >
          Scan a box barcode, then scan item QR codes inside
        </div>
      )}
      <Row label="Expected units" value={expected} />
      <Row label="Received" value={received} tone="accent" />
      <Row label="Damaged" value={units(damaged)} tone="destructive" />
      <Row label="Rejected" value={units(flagged)} tone="destructive" />
      <Row label="Short" value={shortUnits} />
      {canPartialClose && onPartialClose && (
        <button
          type="button"
          className="scan-btn scan-btn-outline"
          style={{ marginTop: 8, width: '100%', minHeight: 48 }}
          disabled={partialClosing}
          onClick={onPartialClose}
        >
          {partialClosing ? 'Closing GRN…' : 'Close with shortages'}
        </button>
      )}
      {complete && onFinalizePutaway && (
        <button
          type="button"
          className="scan-btn scan-btn-primary"
          style={{ marginTop: 8, width: '100%', minHeight: 48 }}
          disabled={finalizing}
          onClick={onFinalizePutaway}
        >
          {finalizing ? 'Posting stock…' : 'Post stock & open Putaway'}
        </button>
      )}
    </section>
  )
}

function Row({ label, value, tone }: { label: string; value: number; tone?: 'accent' | 'destructive' }) {
  const color = tone === 'accent' ? 'var(--accent)' : tone === 'destructive' ? 'var(--destructive)' : 'var(--foreground)'
  const n = Number.isFinite(value) ? value : 0
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        background: 'var(--card)',
        padding: '16px',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      <span style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color }}>{n}</span>
    </div>
  )
}
