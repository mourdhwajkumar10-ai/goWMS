import { ArrowRight } from 'lucide-react'

type Props = { remaining: number; onSignoff?: () => void }

export default function SignoffBar({ remaining, onSignoff }: Props) {
  const done = remaining === 0
  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 20,
        background: 'linear-gradient(to top, var(--background) 60%, transparent)',
        padding: '12px 0 20px',
        marginTop: 8,
      }}
    >
      <button
        type="button"
        onClick={onSignoff}
        className="scan-btn scan-btn-primary"
        style={{ width: '100%', minHeight: 56, fontSize: 16, gap: 10 }}
      >
        <span>Sign off transporter</span>
        {!done && (
          <span
            style={{
              borderRadius: 9999,
              background: 'oklch(1 0 0 / 0.15)',
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 500,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {remaining} left
          </span>
        )}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
