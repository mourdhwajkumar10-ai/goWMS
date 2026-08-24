import { useState, useCallback } from 'react'
import api from '../services/api'
import ScannerLayout, { useScannerToasts, ScannerToastBar } from '../components/ScannerLayout'
import { useScanFeedback } from '../hooks/useScanFeedback'
import '../styles/scanner.css'

type Mode = 'auto' | 'item' | 'location'

export default function StockPeek() {
  const fb = useScanFeedback()
  const { toasts, toast } = useScannerToasts()
  const [mode, setMode] = useState<Mode>('auto')
  const [code, setCode] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const lookup = useCallback(async (raw?: string) => {
    const q = (raw ?? code).trim()
    if (!q) return
    setLoading(true); setCode(q)
    const r = await api.scanLookup(q, mode)
    setLoading(false)
    if (r.ok) {
      setResult(r.data); fb.ok()
      toast(r.data.kind === 'item' ? `Item: ${q}` : `Location: ${q}`, 'ok')
    } else {
      setResult(null); fb.err()
      toast(r.error ?? 'Not found', 'err')
    }
  }, [code, mode, fb, toast])

  return (
    <ScannerLayout title="Stock Peek" noBack>
      <ScannerToastBar toasts={toasts} />

      <div className="scan-tabs">
        {(['auto', 'item', 'location'] as Mode[]).map(m => (
          <button key={m} className={`scan-tab ${mode === m ? 'active' : ''}`} onClick={() => { setMode(m); setResult(null) }}>
            {m === 'auto' ? 'Auto' : m === 'item' ? 'Item' : 'Location'}
          </button>
        ))}
      </div>

      <div className="scan-bottom-bar">
        <div className="scan-input-chip">
          <span style={{ fontSize: 16, flexShrink: 0 }}>{mode === 'item' ? '📦' : mode === 'location' ? '📍' : '🔍'}</span>
          <input type="text" value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookup() } }}
            placeholder={
              mode === 'item' ? 'Scan item…' : mode === 'location' ? 'Scan location…' : 'Scan anything…'
            }
            autoFocus autoComplete="off" />
        </div>
        <button className="scan-icon-btn primary" onClick={() => lookup()} disabled={!code.trim() || loading} aria-label="Search">
          {loading ? '…' : '→'}
        </button>
      </div>

      {result?.kind === 'item' && result?.summary && (
        <div>
          <div className="scan-card">
            <div className="scan-card-icon blue">📦</div>
            <div className="scan-card-body">
              <div className="scan-card-code">{result.summary.item_code}</div>
              <div className="scan-card-detail">{result.summary.item_name}</div>
            </div>
          </div>
          <div className="scan-stock-grid" style={{ marginTop: 8 }}>
            <div className="scan-stock-cell">
              <div className="scan-stock-cell-label">Total Stock</div>
              <div className="scan-stock-cell-value">{result.summary.total_qty ?? '—'}</div>
            </div>
            <div className="scan-stock-cell">
              <div className="scan-stock-cell-label">Available</div>
              <div className="scan-stock-cell-value" style={{ color: '#286840' }}>{result.summary.available_qty ?? '—'}</div>
            </div>
            <div className="scan-stock-cell">
              <div className="scan-stock-cell-label">Batch</div>
              <div className="scan-stock-cell-value" style={{ fontSize: 13 }}>{result.summary.batch_no || '—'}</div>
            </div>
            <div className="scan-stock-cell">
              <div className="scan-stock-cell-label">Status</div>
              <div className="scan-stock-cell-value" style={{ fontSize: 12 }}>
                <span className="scan-chip storage">{result.summary.alloc_status ?? '?'}</span>
              </div>
            </div>
          </div>
          {result.rows?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="scan-section-title">Locations ({result.rows.length})</div>
              {result.rows.map((r: any, i: number) => (
                <div key={i} className="scan-row" style={{ padding: '8px 10px', marginBottom: 4 }}>
                  <span className={`scan-chip ${r.location_type ?? 'storage'}`}>{r.location_code}</span>
                  <div className="scan-row-info">
                    <div className="scan-row-desc">{r.warehouse_code}</div>
                  </div>
                  <div className="scan-row-qty" style={{ fontSize: 14 }}>{r.actual_qty ?? r.qty}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {result?.kind === 'location' && result?.summary && (
        <div>
          <div className="scan-card">
            <div className="scan-card-icon blue">📍</div>
            <div className="scan-card-body">
              <div className="scan-card-code">{result.summary.location_code}</div>
              <div className="scan-card-detail">
                {result.summary.aisle} · shelf {result.summary.shelf} · {result.summary.location_type}
              </div>
            </div>
          </div>
          {result.rows?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div className="scan-section-title">Items ({result.rows.length})</div>
              {result.rows.map((r: any, i: number) => (
                <div key={i} className="scan-row" style={{ padding: '8px 10px', marginBottom: 4 }}>
                  <div className="scan-row-info">
                    <div className="scan-row-code">{r.item_code}</div>
                    <div className="scan-row-desc">{r.item_name ?? ''} {r.batch_no ? `· ${r.batch_no}` : ''}</div>
                  </div>
                  <div className="scan-row-qty" style={{ fontSize: 14 }}>{r.actual_qty ?? r.qty}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </ScannerLayout>
  )
}