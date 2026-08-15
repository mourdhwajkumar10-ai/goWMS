import { useEffect, useRef, useState } from 'react'
import {
  BrowserMultiFormatReader,
  DecodeHintType,
  BarcodeFormat,
} from '@zxing/library'

interface Props {
  onScan: (code: string) => void
  onClose: () => void
}

// Native BarcodeDetector is fastest on Android Chrome; ZXing is the fallback
// for iOS Safari and desktops that lack it.
type NativeDetector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>
}

const FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
]

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const doneRef = useRef(false)

  const [manualCode, setManualCode] = useState('')
  const [useCamera, setUseCamera] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('Starting camera…')

  const emit = (code: string) => {
    const value = (code || '').trim()
    if (!value || doneRef.current) return
    doneRef.current = true
    stopCamera()
    onScan(value)
  }

  const stopCamera = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    try {
      readerRef.current?.reset()
    } catch {
      // ignore
    }
    readerRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  useEffect(() => {
    if (!useCamera) return
    doneRef.current = false
    let cancelled = false

    const isSecure =
      window.isSecureContext ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1'

    const startNative = async (detector: NativeDetector) => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      })
      if (cancelled) {
        stream.getTracks().forEach(t => t.stop())
        return
      }
      streamRef.current = stream
      const video = videoRef.current!
      video.srcObject = stream
      await video.play().catch(() => {})
      setStatus('Point the camera at a QR or barcode')

      const tick = async () => {
        if (cancelled || doneRef.current) return
        try {
          if (video.readyState >= 2) {
            const hits = await detector.detect(video)
            if (hits && hits.length && hits[0].rawValue) {
              emit(hits[0].rawValue)
              return
            }
          }
        } catch {
          // transient decode error, keep scanning
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    const startZxing = async () => {
      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS)
      hints.set(DecodeHintType.TRY_HARDER, true)
      const reader = new BrowserMultiFormatReader(hints)
      readerRef.current = reader
      await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current!,
        (result) => {
          if (result) emit(result.getText())
        },
      )
      if (cancelled) {
        stopCamera()
        return
      }
      setStatus('Point the camera at a QR or barcode')
    }

    const start = async () => {
      if (!isSecure) {
        setError('Camera needs HTTPS. Open the app over https:// (or localhost) to scan.')
        setUseCamera(false)
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser cannot access the camera.')
        setUseCamera(false)
        return
      }
      try {
        const Detector = (window as unknown as { BarcodeDetector?: new (o?: unknown) => NativeDetector }).BarcodeDetector
        if (Detector) {
          try {
            await startNative(new Detector({ formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'code_39', 'itf', 'data_matrix', 'codabar'] }))
            return
          } catch {
            // fall through to ZXing
          }
        }
        await startZxing()
      } catch (err) {
        const name = (err as { name?: string })?.name
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setError('Camera permission denied. Allow camera access and try again.')
        } else if (name === 'NotFoundError') {
          setError('No camera found on this device.')
        } else {
          setError('Could not start the camera. Type the code instead.')
        }
        setUseCamera(false)
      }
    }

    start()
    return () => {
      cancelled = true
      stopCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useCamera])

  const handleManualSubmit = () => {
    if (manualCode.trim()) emit(manualCode.trim())
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Scan QR / Barcode</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-dim)' }} aria-label="Close scanner">✕</button>
        </div>

        {useCamera ? (
          <div style={{ marginBottom: 16 }}>
            <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#000' }}>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{ width: '100%', display: 'block', aspectRatio: '4 / 3', objectFit: 'cover' }}
              />
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: '18% 22%',
                  border: '2px solid rgba(255,255,255,0.9)',
                  borderRadius: 12,
                  boxShadow: '0 0 0 100vmax rgba(0,0,0,0.25)',
                }}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8, textAlign: 'center' }}>
              {status}
            </p>
          </div>
        ) : (
          <div style={{ marginBottom: 16, padding: 24, textAlign: 'center', background: 'var(--panel-2)', borderRadius: 8 }}>
            <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>📷 Camera unavailable</p>
            <button
              onClick={() => { setError(''); setUseCamera(true) }}
              style={{ marginTop: 8, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}
            >
              Try camera again
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="erpnext-input"
            value={manualCode}
            onChange={e => setManualCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
            placeholder="Or type / paste code…"
          />
          <button className="erpnext-btn-primary" onClick={handleManualSubmit}>Enter</button>
        </div>

        {error && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{error}</p>}
      </div>
    </div>
  )
}
