import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Keyboard, RefreshCw, ScanLine } from 'lucide-react'
import CameraScanner from '../CameraScanner'
import { buzz } from '../../hooks/useScanFeedback'
import ScanViewport, { type ScanState } from './ScanViewport'
import ScanVerdict from './ScanVerdict'

type Props = {
  state: ScanState
  code?: string
  reason?: string
  onMarkDamaged: () => void
  canMarkDamaged: boolean
  onRestart: () => void
  onManualEntry: (code: string) => void
  placeholder?: string
  showMarkDamaged?: boolean
  markDamagedLabel?: string
  /** Bump to remount embedded camera after restart */
  cameraKey?: number | string
  readyTitle?: string
  readySubtitle?: string
  hardwareHint?: string
  /** CameraScanner continuous decode mode */
  continuous?: boolean
  idlePrompt?: string
  /** Hide mark-damaged + restart row */
  showActionRow?: boolean
}

export default function ScanCard({
  state,
  code,
  reason,
  onMarkDamaged,
  canMarkDamaged,
  onRestart,
  onManualEntry,
  placeholder = 'Type box number',
  showMarkDamaged = true,
  markDamagedLabel = 'Mark damaged',
  cameraKey = 0,
  readyTitle,
  readySubtitle,
  hardwareHint = 'Hardware scanner is ready',
  continuous = true,
  idlePrompt,
  showActionRow = true,
}: Props) {
  const [value, setValue] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const wedgeRef = useRef<HTMLInputElement>(null)
  const manualRef = useRef<HTMLInputElement>(null)
  const hapticPrimedRef = useRef(false)

  const primeHaptic = () => {
    if (hapticPrimedRef.current) return
    hapticPrimedRef.current = true
    buzz(1)
  }

  useEffect(() => {
    if (manualOpen) {
      manualRef.current?.focus()
    } else {
      wedgeRef.current?.focus()
    }
  }, [manualOpen, cameraOpen])

  function deliverScan(raw: string) {
    const next = raw.trim()
    if (!next) return
    onManualEntry(next)
    setValue('')
    requestAnimationFrame(() => wedgeRef.current?.focus())
  }

  function submit(nextValue = value) {
    deliverScan(nextValue)
  }

  function handleRestart() {
    setCameraOpen(false)
    setManualOpen(false)
    setValue('')
    onRestart()
    requestAnimationFrame(() => wedgeRef.current?.focus())
  }

  return (
    <section className="scan-card-section">
      <input
        ref={wedgeRef}
        defaultValue=""
        onFocus={primeHaptic}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            deliverScan(e.currentTarget.value)
            e.currentTarget.value = ''
          }
        }}
        aria-label="Hardware scanner capture"
        className="scan-capture-input"
      />

      <ScanViewport
        state={state}
        cameraOpen={cameraOpen}
        onOpenCamera={() => setCameraOpen(true)}
        onCloseCamera={() => setCameraOpen(false)}
        readyTitle={readyTitle}
        readySubtitle={readySubtitle}
        cameraSlot={
          <div className="scan-live-viewport">
            <CameraScanner
              key={cameraKey}
              embedded
              open
              continuous={continuous}
              onClose={() => setCameraOpen(false)}
              onScan={(scanned) => deliverScan(String(scanned || ''))}
            />
          </div>
        }
      />

      {!cameraOpen && (
        <div className="scan-hardware-bar">
          <ScanLine className="scan-hardware-bar-icon" aria-hidden="true" />
          <span className="scan-hardware-bar-text">{hardwareHint}</span>
          <button
            type="button"
            className="scan-manual-toggle"
            onClick={() => setManualOpen((open) => !open)}
          >
            <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
            Manual
          </button>
        </div>
      )}

      <ScanVerdict state={state} code={code} reason={reason} idlePrompt={idlePrompt} />

      {showActionRow && (
        <div className="scan-action-row">
          {showMarkDamaged && (
            <button
              type="button"
              onClick={onMarkDamaged}
              disabled={!canMarkDamaged}
              className="scan-btn scan-btn-outline scan-mark-damaged-btn"
            >
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {markDamagedLabel}
            </button>
          )}
          <button
            type="button"
            onClick={handleRestart}
            className="scan-icon-btn"
            aria-label="Restart scanner"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {manualOpen && (
        <div className="scan-manual-panel">
          <div className="scan-action-row">
            <input
              ref={manualRef}
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
              }}
              placeholder={placeholder}
              aria-label={placeholder}
              className="scan-count-input scan-manual-input"
            />
            <button type="button" onClick={() => submit()} className="scan-btn scan-btn-primary scan-enter-btn">
              Enter
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
