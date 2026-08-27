'use client'

import { useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { ScanViewport, type ScanState } from './scan-viewport'
import { ScanVerdict } from './scan-verdict'

type ScanCardProps = {
  state: ScanState
  code: string
  reason?: string
  onMarkDamaged: () => void
  canMarkDamaged: boolean
  onRestart: () => void
  onManualEntry: (code: string) => void
}

export function ScanCard({
  state,
  code,
  reason,
  onMarkDamaged,
  canMarkDamaged,
  onRestart,
  onManualEntry,
}: ScanCardProps) {
  const [value, setValue] = useState('')

  function submit() {
    if (!value.trim()) return
    onManualEntry(value.trim())
    setValue('')
  }

  return (
    <section className="flex flex-col gap-3 px-4">
      <ScanViewport state={state} />
      <ScanVerdict state={state} code={code} reason={reason} />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onMarkDamaged}
          disabled={!canMarkDamaged}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-border/70 bg-card text-sm font-medium text-destructive transition active:scale-[0.98] disabled:text-muted-foreground/40"
        >
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          Mark damaged
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-border/70 bg-card text-muted-foreground transition active:scale-95"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Restart scanner</span>
        </button>
      </div>

      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) submit()
          }}
          placeholder="Type box number"
          aria-label="Box number"
          className="h-12 min-w-0 flex-1 rounded-lg border border-border/70 bg-card px-4 font-mono text-sm outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        <button
          type="button"
          onClick={submit}
          className="h-12 shrink-0 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition active:scale-95"
        >
          Enter
        </button>
      </div>
    </section>
  )
}
