type Props = { current: number; total: number; order?: string }

export default function ScanHeader({ current, total, order }: Props) {
  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="scanner-header-big">{current}</span>
          <span className="scanner-header-small">/ {total}</span>
        </div>
        {order && <span className="scanner-header-meta">{order}</span>}
      </div>
      <div className="scan-progress-dots" role="img" aria-label={`${current} of ${total} boxes scanned`}>
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={`scan-progress-dot ${i < current ? 'done' : i === current ? 'current' : ''}`} />
        ))}
      </div>
    </header>
  )
}
