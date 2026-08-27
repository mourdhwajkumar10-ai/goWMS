'use client'

import { ArrowRight } from 'lucide-react'

type SignoffBarProps = {
  remaining: number
}

export function SignoffBar({ remaining }: SignoffBarProps) {
  const done = remaining === 0

  return (
    <div className="sticky bottom-0 z-20 bg-gradient-to-t from-background via-background to-transparent px-4 pb-5 pt-3">
      <button
        type="button"
        className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-primary text-primary-foreground transition active:scale-[0.98]"
      >
        <span className="text-base font-medium">Sign off transporter</span>
        {!done && (
          <span className="rounded-full bg-primary-foreground/15 px-2.5 py-1 text-xs font-medium tabular-nums">
            {remaining} left
          </span>
        )}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
