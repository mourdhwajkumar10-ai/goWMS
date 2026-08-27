'use client'

import { Check, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ScanState } from './scan-viewport'

type ScanVerdictProps = {
  state: ScanState
  code: string
  reason?: string
}

export function ScanVerdict({ state, code, reason }: ScanVerdictProps) {
  if (state === 'idle') {
    return (
      <section className="flex h-24 items-center justify-center gap-2.5 rounded-xl bg-muted">
        <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
        <span className="text-lg font-medium text-muted-foreground">Hold over the label</span>
      </section>
      </section>
    )
  }

  const tone =
    state === 'accepted'
      ? { bg: 'bg-accent', fg: 'text-accent-foreground', label: 'Counted', Icon: Check }
      : state === 'rejected'
        ? { bg: 'bg-destructive', fg: 'text-destructive-foreground', label: 'Rejected', Icon: X }
        : { bg: 'bg-warning', fg: 'text-warning-foreground', label: 'Try again', Icon: RotateCcw }

  const { bg, fg, label, Icon } = tone

  return (
    <section
      aria-live="assertive"
      className={cn('flex h-24 items-center gap-4 rounded-xl px-5 animate-verdict', bg, fg)}
    >
      <Icon className="h-10 w-10 shrink-0" strokeWidth={3} aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-3xl font-semibold leading-none tracking-tight">{label}</p>
        <p className="truncate font-mono text-xs opacity-75">
          {state === 'timeout' ? 'No code found' : reason ? reason : code}
        </p>
      </div>
    </section>
  )
}
