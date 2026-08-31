import type { ReactNode } from 'react'

export type ScanState = 'idle' | 'accepted' | 'warning' | 'rejected' | 'timeout'

type Props = {
  state: ScanState
  cameraOpen: boolean
  onOpenCamera: () => void
  onCloseCamera: () => void
  cameraSlot?: ReactNode
  readyTitle?: string
  readySubtitle?: string
}

export default function ScanViewport({
  state,
  cameraOpen,
  onOpenCamera,
  onCloseCamera,
  cameraSlot,
  readyTitle = 'Ready to scan',
  readySubtitle = 'MT90 imager connected · aim and press trigger',
}: Props) {
  if (!cameraOpen) {
    return (
      <div className="scan-ready-card">
        <div className="scan-ready-icon" aria-hidden="true">
          <span className="scan-ready-dot" />
        </div>
        <div className="scan-ready-text">
          <p className="scan-ready-title">{readyTitle}</p>
          <p className="scan-ready-sub">{readySubtitle}</p>
        </div>
        <button type="button" className="scan-use-camera-btn" onClick={onOpenCamera}>
          Use camera
        </button>
      </div>
    )
  }

  return (
    <div className="scan-camera-expanded">
      <div className="scan-camera-expanded-view">
        {cameraSlot}
      </div>
      <button type="button" className="scan-close-camera-btn" onClick={onCloseCamera}>
        Close camera
      </button>
    </div>
  )
}
