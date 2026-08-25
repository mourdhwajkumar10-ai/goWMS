import { Keyboard, MapPin, Undo2 } from 'lucide-react'

type Props = { bin: string; onUndo: () => void; canUndo: boolean; onManual?: () => void }

export default function ScanActions({ bin, onUndo, canUndo, onManual }: Props) {
  return (
    <div className="scan-bottom-bar">
      <div className="scan-input-chip" style={{ flex: 1 }}>
        <MapPin className="h-5 w-5 shrink-0" style={{ color: 'var(--muted-foreground)' }} aria-hidden="true" />
        <span style={{ fontFamily: 'var(--sm-font-mono)', fontWeight: 500 }}>{bin}</span>
      </div>
      <button type="button" onClick={onUndo} disabled={!canUndo} className="scan-icon-btn" aria-label="Undo last scan">
        <Undo2 className="h-5 w-5" aria-hidden="true" />
      </button>
      <button type="button" onClick={onManual} className="scan-icon-btn primary" aria-label="Enter code manually">
        <Keyboard className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  )
}
