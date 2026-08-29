import { ReactNode } from 'react'
import ScannerLayout from '../ScannerLayout'
import ScanCard from '../scan/ScanCard'
import VerificationHeader from '../scan/VerificationHeader'
import { ProgressDots } from '../common/ProgressDots'
import { ProgressBar } from '../common/ProgressBar'
import { FlashOverlay } from '../common/FlashOverlay'
import { useScannerState, BaseScannerState } from '../../hooks/useScannerState'

export interface ScannerPageSlots {
  header?: ReactNode
  camera?: ReactNode
  verdict?: ReactNode
  progress?: ReactNode
  prompt?: ReactNode
  flash?: ReactNode
  footer?: ReactNode
  toasts?: ReactNode
}

export interface ScannerPageProps {
  title: string
  step: number
  totalSteps: number
  progressVariant: 'dots' | 'bar'
  flash?: 'success' | 'error' | 'warning' | null
  slots: ScannerPageSlots
}

export function ScannerPage({ 
  title, 
  step, 
  totalSteps, 
  progressVariant, 
  flash, 
  slots 
}: ScannerPageProps) {
  // Convert flash type for ScannerLayout
  const scannerLayoutFlash = flash === 'success' ? 'ok' : flash === 'error' ? 'err' : null
  
  return (
    <ScannerLayout
      title={title}
      stat={String(step)}
      statOf={String(totalSteps)}
      progressVariant={progressVariant}
      flash={scannerLayoutFlash}
    >
      {slots.header}
      {slots.camera}
      {slots.verdict}
      {slots.progress}
      {slots.prompt}
      {slots.flash}
      {slots.footer}
      <FlashOverlay type={flash ?? null} visible={!!flash} />
      {slots.toasts}
    </ScannerLayout>
  )
}

// Re-export the base hook for pages to use
export { useScannerState, type BaseScannerState } from '../../hooks/useScannerState'