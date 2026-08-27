'use client'

import { Keyboard, MapPin, Undo2 } from 'lucide-react'

type ScanActionsProps = {
  bin: string
  onUndo: () => void
  canUndo: boolean
}

export function ScanActions({ bin, onUndo, canUndo }: ScanActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl bg-card px-4 py-3.5">
        <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate font-mono text-base font-medium">{bin}</span>
      </div>

      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className="grid h-[52px] w-[52px] place-items-center rounded-2xl bg-card text-foreground transition active:scale-95 disabled:text-muted-foreground/40"
      >
        <Undo2 className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">Undo last scan</span>
      </button>

      <button
        type="button"
        className="grid h-[52px] w-[52px] place-items-center rounded-2xl bg-primary text-primary-foreground transition active:scale-95"
      >
        <Keyboard className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">Enter code manually</span>
      </button>
    </div>
  )
}
