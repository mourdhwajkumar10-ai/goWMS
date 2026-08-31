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
    <div className="modal-overlay scanner-overlay" onClick={onClose}>
      <div className="modal scanner-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="scanner-title">
        <div className="scanner-head">
          <h2 id="scanner-title" className="scanner-title">Scan QR / Barcode</h2>
          <button type="button" className="scanner-close" onClick={onClose} aria-label="Close scanner">✕</button>
        </div>

        {useCamera ? (
          <div className="scanner-camera">
            <div className="scanner-viewport">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="scanner-video"
              />
              <div className="scanner-reticle" aria-hidden />
            </div>
            <p className="scanner-status">{status}</p>
          </div>
        ) : (
          <div className="scanner-fallback">
            <p className="scanner-fallback-copy">Camera unavailable — type or paste a code below.</p>
            <button
              type="button"
              className="erpnext-btn-secondary scanner-retry"
              onClick={() => { setError(''); setUseCamera(true) }}
            >
              Try camera again
            </button>
          </div>
        )}

        <div className="scanner-manual">
          <input
            className="erpnext-input scanner-input"
            value={manualCode}
            onChange={e => setManualCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
            placeholder="Or type / paste code…"
            aria-label="Type or paste barcode"
          />
          <button type="button" className="erpnext-btn-primary scanner-enter" onClick={handleManualSubmit}>
            Enter
          </button>
        </div>

        {error && <p className="scanner-error">{error}</p>}
      </div>

      <style>{`
        .scanner-overlay {
          padding: 16px;
        }
        .scanner-modal {
          max-width: 440px;
          width: 100%;
          background: var(--card, #fff);
          border: 1px solid var(--border, #d1d5db);
          border-radius: 10px;
          padding: 16px;
          box-shadow: var(--shadow-md, 0 12px 40px rgba(15, 23, 42, 0.18));
        }
        .scanner-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }
        .scanner-title {
          margin: 0;
          font-size: 16px;
          font-weight: 650;
          letter-spacing: -0.02em;
          color: var(--text-color, #111827);
          line-height: 1.2;
        }
        .scanner-close {
          appearance: none;
          background: none;
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 6px;
          cursor: pointer;
          color: var(--text-dim, #6b7280);
          font-size: 18px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .scanner-close:hover {
          background: oklch(0.96 0.005 250);
          color: var(--text-color, #111827);
        }
        .scanner-camera {
          margin-bottom: 14px;
        }
        .scanner-viewport {
          position: relative;
          border-radius: 8px;
          overflow: hidden;
          background: #0b1220;
          border: 1px solid var(--border, #d1d5db);
        }
        .scanner-video {
          width: 100%;
          display: block;
          aspect-ratio: 4 / 3;
          object-fit: cover;
          vertical-align: top;
        }
        .scanner-reticle {
          position: absolute;
          inset: 18% 22%;
          border: 2px solid rgba(255, 255, 255, 0.92);
          border-radius: 12px;
          box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.28);
          pointer-events: none;
        }
        .scanner-status {
          margin: 10px 0 0;
          font-size: 12px;
          line-height: 1.4;
          color: var(--text-dim, #6b7280);
          text-align: center;
        }
        .scanner-fallback {
          margin-bottom: 14px;
          padding: 20px 16px;
          text-align: center;
          border: 1px solid var(--border, #d1d5db);
          border-radius: 8px;
          background: var(--card, #fff);
        }
        .scanner-fallback-copy {
          margin: 0;
          font-size: 13px;
          color: var(--text-dim, #6b7280);
          line-height: 1.45;
        }
        .scanner-retry {
          margin-top: 10px;
          height: 32px;
          min-height: 32px;
          padding: 0 12px;
          font-size: 13px;
        }
        .scanner-manual {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .scanner-input.erpnext-input,
        .scanner-modal .scanner-input {
          flex: 1 1 auto;
          min-width: 0;
          width: auto !important;
          max-width: none;
          height: 40px !important;
          min-height: 40px !important;
          padding: 0 12px !important;
          border: 1px solid var(--border, #d1d5db) !important;
          border-radius: 6px !important;
          background: var(--card, #fff) !important;
          box-shadow: none !important;
          font-size: 13px;
        }
        .scanner-input.erpnext-input:focus,
        .scanner-modal .scanner-input:focus {
          border-color: var(--primary, #2563eb) !important;
          box-shadow: 0 0 0 3px oklch(0.56 0.18 250 / 0.10) !important;
        }
        .scanner-enter {
          flex: 0 0 auto;
          height: 40px !important;
          min-height: 40px !important;
          padding: 0 16px !important;
          font-size: 14px;
          font-weight: 600;
          border-radius: 6px;
        }
        .scanner-error {
          margin: 10px 0 0;
          font-size: 12px;
          line-height: 1.4;
          color: var(--red, #b91c1c);
        }
      `}</style>
    </div>
  )
}
