'use client'

import { cn } from '@/lib/utils'

export type ScanState = 'idle' | 'accepted' | 'rejected' | 'timeout'

type ScanViewportProps = {
  state: ScanState
}

export function ScanViewport({ state }: ScanViewportProps) {
  const settled = state !== 'idle'

  return (
    <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl bg-primary/90">
      <img
        src="/images/carton-feed.png"
        alt="Live camera view of the carton being scanned"
        className={cn(
          'absolute inset-0 h-full w-full object-cover transition-all duration-300',
          settled ? 'scale-105 blur-[2px] brightness-[0.6]' : 'brightness-95',
        )}
      />

      {/* target frame */}
      <div className="absolute inset-0 grid place-items-center">
        <div
          className={cn(
            'relative aspect-square h-[58%] transition-all duration-300',
            settled ? 'scale-90 opacity-0' : 'opacity-100',
          )}
        >
          <Corner className="left-0 top-0" />
          <Corner className="right-0 top-0 rotate-90" />
          <Corner className="bottom-0 right-0 rotate-180" />
          <Corner className="bottom-0 left-0 -rotate-90" />
          <div className="absolute inset-x-1.5 top-1/2 h-px bg-background/85 shadow-[0_0_14px_rgba(255,255,255,0.7)] animate-sweep" />
        </div>
      </div>
    </div>
  )
}

function Corner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'absolute h-7 w-7 rounded-tl-xl border-l-3 border-t-3 border-background',
        className,
      )}
    />
  )
}
