import { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { PageHeader } from '../common/PageHeader'
import { ProgressDots } from '../common/ProgressDots'
import { ProgressBar } from '../common/ProgressBar'

export interface WizardPageProps {
  title: string
  subtitle?: string
  steps: { key: string; label: string; icon?: ReactNode }[]
  currentStep: number
  onStepChange: (step: number) => void
  headerActions?: { label: string; onClick: () => void; variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'; icon?: ReactNode; disabled?: boolean }[]
  panels: Record<string, ReactNode>
  progress: { current: number; total: number }
  className?: string
}

export function WizardPage({ 
  title, 
  subtitle, 
  steps, 
  currentStep, 
  onStepChange, 
  headerActions, 
  panels, 
  progress, 
  className 
}: WizardPageProps) {
  return (
    <div className={cn('rw-page', className)}>
      <PageHeader title={title} description={subtitle} actions={headerActions} />
      <div className="rw-dash">
        {/* Step navigation tabs */}
        <div className="rw-phase-tabs">
          {steps.map((s, i) => (
            <button
              key={s.key}
              className={cn('rw-phase-tab', i === currentStep ? 'is-current' : '', i < currentStep ? 'is-done' : '', i > currentStep ? 'disabled' : '')}
              onClick={() => i <= currentStep && onStepChange(i)}
              disabled={i > currentStep}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        {/* Current panel */}
        <div className="rw-dash-left">
          {panels[steps[currentStep].key]}
        </div>
        <div className="rw-dash-right">
          {panels[steps[currentStep].key]}
        </div>
        {/* Progress bar */}
        <div className="rw-progress-inline">
          <div className="rw-progress-track">
            <div className="rw-progress-fill" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
          </div>
          <span className="rw-progress-label">{progress.current}/{progress.total}</span>
        </div>
      </div>
    </div>
  )
}