import { useEffect } from 'react'
import { cn } from '../../lib/utils'

interface FlashOverlayProps {
  type: 'success' | 'error' | 'warning' | null
  visible: boolean
  onComplete?: () => void
}

export function FlashOverlay({ type, visible, onComplete }: FlashOverlayProps) {
  useEffect(() => {
    if (!visible || !type) return
    const timer = setTimeout(() => {
      onComplete?.()
    }, 300)
    return () => clearTimeout(timer)
  }, [visible, type, onComplete])

  if (!visible || !type) return null

  return (
    <div className={cn('scan-flash show', type)} style={{ pointerEvents: 'none', position: 'fixed', inset: 0, zIndex: 1000, transition: 'opacity 0.1s ease' }} />
  )
}