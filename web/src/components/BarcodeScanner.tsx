import { useEffect, useRef, useState } from 'react'

interface Props {
  onScan: (code: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [manualCode, setManualCode] = useState('')
  const [useCamera, setUseCamera] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!useCamera) return
    let stream: MediaStream | null = null

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch {
        setUseCamera(false)
      }
    }

    start()

    return () => {
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [useCamera])

  const handleManualSubmit = () => {
    if (manualCode.trim()) {
      onScan(manualCode.trim())
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ minWidth: 400 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Scan Barcode</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-dim)' }}>✕</button>
        </div>

        {useCamera ? (
          <div style={{ marginBottom: 16 }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              style={{ width: '100%', borderRadius: 8, background: '#000' }}
            />
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8, textAlign: 'center' }}>
              Point camera at barcode
            </p>
          </div>
        ) : (
          <div style={{ marginBottom: 16, padding: 24, textAlign: 'center', background: 'var(--panel-2)', borderRadius: 8 }}>
            <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>📷 Camera not available</p>
            <button
              onClick={() => setUseCamera(true)}
              style={{ marginTop: 8, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}
            >
              Try again
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="erpnext-input"
            value={manualCode}
            onChange={e => setManualCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
            placeholder="Type or paste barcode..."
            autoFocus
          />
          <button className="erpnext-btn-primary" onClick={handleManualSubmit}>Scan</button>
        </div>

        {error && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{error}</p>}
      </div>
    </div>
  )
}
