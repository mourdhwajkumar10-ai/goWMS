import { ArrowRight } from 'lucide-react'

type Props = { remaining: number; onSignoff?: () => void }

export default function SignoffBar({ remaining, onSignoff }: Props) {
  const done = remaining === 0
  return (
    <div className="scan-signoff-bar scan-rf-block">
      <button
        type="button"
        onClick={onSignoff}
        className="scan-btn scan-btn-primary scan-signoff-btn"
      >
        <span>Sign off transporter</span>
        {!done && (
          <span className="scan-signoff-pill">{remaining} left</span>
        )}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
