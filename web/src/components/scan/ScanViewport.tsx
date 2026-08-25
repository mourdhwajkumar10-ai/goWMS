export type ScanState = 'idle' | 'accepted' | 'rejected' | 'timeout'

type Props = {
  state: ScanState
  /** @deprecated Decorative carton images are no longer used — pass CameraScanner via ScanCard viewport instead */
  imageSrc?: string
  message?: string
}

/** Honest non-camera fallback. Prefer ScanCard `viewport={<CameraScanner …/>}` for live scanning. */
export default function ScanViewport({
  state,
  message = 'Camera unavailable — type or scan the code in the field below',
}: Props) {
  const settled = state !== 'idle'
  return (
    <div className={`scan-camera-area scan-camera-fallback ${settled ? 'settled' : ''}`} role="status">
      <div className="scan-camera-fallback-body">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          <path d="M7 12h10" />
        </svg>
        <span>{message}</span>
      </div>
      <div className="scan-camera-corners" aria-hidden="true">
        <div className={`scan-camera-frame ${settled ? 'settled' : ''}`}>
          <span className="corner tl" />
          <span className="corner tr" />
          <span className="corner br" />
          <span className="corner bl" />
        </div>
      </div>
    </div>
  )
}
