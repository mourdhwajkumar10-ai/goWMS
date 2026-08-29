import { useState, useCallback } from 'react'
import ScannerLayout from '../components/ScannerLayout'
import CameraScanner from '../components/CameraScanner'
import VerificationHeader, { type Tab } from '../components/scan/VerificationHeader'
import ScanCard from '../components/scan/ScanCard'
import BoxQueue, { type Box } from '../components/scan/BoxQueue'
import ItemsPanel from '../components/scan/ItemsPanel'
import SignoffBar from '../components/scan/SignoffBar'
import { useScanFeedback } from '../hooks/useScanFeedback'
import type { ScanState } from '../components/scan/ScanViewport'
import '../styles/scanner.css'

const MOCK_BOXES: Box[] = [
  { id: 'BOX-882910-A', items: 4, units: 24, status: 'pending' },
  { id: 'BOX-882910-B', items: 2, units: 12, status: 'pending' },
  { id: 'BOX-882910-C', items: 3, units: 18, status: 'pending' },
  { id: 'BOX-882910-D', items: 1, units: 6, status: 'pending' },
  { id: 'BOX-882910-E', items: 5, units: 30, status: 'pending' },
  { id: 'BOX-882910-F', items: 2, units: 10, status: 'pending' },
]

export default function BoxVerification() {
  const fb = useScanFeedback()
  const [boxes, setBoxes] = useState<Box[]>(MOCK_BOXES)
  const [tab, setTab] = useState<Tab>('boxes')
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [lastCode, setLastCode] = useState('')
  const [reason, setReason] = useState<string | undefined>()
  const [cameraKey, setCameraKey] = useState(0)

  const counted = boxes.filter((b) => b.status === 'counted').length
  const total = boxes.length
  const nextBox = boxes.find((b) => b.status === 'pending')

  const handleManualEntry = useCallback(
    (code: string) => {
      setLastCode(code)
      const idx = boxes.findIndex((b) => b.id === code)
      if (idx === -1) {
        fb.err()
        setScanState('rejected')
        setReason('Box not in shipment')
        setTimeout(() => setScanState('idle'), 1200)
        return
      }
      if (boxes[idx].status !== 'pending') {
        fb.warn()
        setScanState('rejected')
        setReason('Already counted')
        setTimeout(() => setScanState('idle'), 1200)
        return
      }
      fb.ok()
      setScanState('accepted')
      setBoxes((prev) => prev.map((b) => (b.id === code ? { ...b, status: 'counted' as const } : b)))
      setReason(undefined)
      setTimeout(() => setScanState('idle'), 900)
    },
    [boxes, fb],
  )

  const handleDamaged = useCallback(
    (id: string) => {
      fb.warn()
      setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, status: 'damaged' as const } : b)))
    },
    [fb],
  )

  const handleMarkDamaged = useCallback(() => {
    if (!nextBox) return
    handleDamaged(nextBox.id)
  }, [nextBox, handleDamaged])

  const handleRestart = useCallback(() => {
    setScanState('idle')
    setLastCode('')
    setReason(undefined)
    setCameraKey((k) => k + 1)
  }, [])

  const remaining = boxes.filter((b) => b.status === 'pending').length

  return (
    <ScannerLayout title="Box verification" hideHeader noBack flash={scanState === 'rejected' ? 'err' : scanState === 'accepted' ? 'ok' : null}>
      <VerificationHeader
        counted={counted}
        total={total}
        po="PO-882910"
        pl="PL-882910"
        grn="GRN-882910"
        tab={tab}
        onTabChange={setTab}
      />

      {tab === 'boxes' ? (
        <>
          <ScanCard
            state={scanState}
            code={lastCode || nextBox?.id || ''}
            reason={reason}
            onMarkDamaged={handleMarkDamaged}
            canMarkDamaged={!!nextBox && scanState === 'idle'}
            onRestart={handleRestart}
            onManualEntry={handleManualEntry}
            viewport={
              <div className="scan-live-viewport">
                <CameraScanner
                  key={cameraKey}
                  embedded
                  open
                  onClose={() => {}}
                  onScan={(code) => {
                    handleManualEntry(String(code || '').trim())
                  }}
                />
              </div>
            }
          />
          <BoxQueue boxes={boxes} onDamaged={handleDamaged} />
          <SignoffBar remaining={remaining} onSignoff={() => fb.ok()} />
        </>
      ) : (
        <ItemsPanel boxes={boxes} />
      )}
    </ScannerLayout>
  )
}
