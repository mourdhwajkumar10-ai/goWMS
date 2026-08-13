import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import BarcodeScanner from '../components/BarcodeScanner'
import { notify } from '../components/Notifications'
import ItemAutocomplete from '../components/ItemAutocomplete'

type Mode = 'auto' | 'item' | 'location'

export default function StockScan() {
  const [mode, setMode] = useState<Mode>('auto')
  const [code, setCode] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [mode])

  const lookup = async (raw?: string) => {
    const q = (raw ?? code).trim()
    if (!q) return
    setLoading(true)
    setCode(q)
    const r = await api.scanLookup(q, mode)
    setLoading(false)
    if (r.ok) {
      setResult(r.data)
      notify({
        type: 'success',
        title: r.data.kind === 'item' ? 'Item found' : 'Location found',
        message: q,
      })
    } else {
      setResult(null)
      notify({ type: 'error', title: 'Not found', message: r.error || q })
    }
  }

  const onScan = (scanned: string) => {
    setShowScanner(false)
    lookup(scanned)
  }

  const allocBadge = (status: string) => {
    const cls =
      status === 'available' || status === 'allocatable' ? 'erpnext-badge-green'
        : status === 'unallocatable' ? 'erpnext-badge-yellow'
          : status === 'partial' ? 'erpnext-badge-yellow'
            : 'erpnext-badge-red'
    return <span className={`erpnext-badge ${cls}`}>{status}</span>
  }

  const summary = result?.summary
  const rows: any[] = result?.rows ?? []

  return (
    <div className="space-y-6">
      {showScanner && <BarcodeScanner onScan={onScan} onClose={() => setShowScanner(false)} />}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Stock Scan</h1>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            Scan an item to see allocatable vs unallocatable stock, or scan a location to list everything in that bin.
          </p>
        </div>
        <button className="erpnext-btn-secondary" onClick={() => setShowScanner(true)}>📷 Camera</button>
      </div>

      <div className="erpnext-card p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {([
            ['auto', 'Auto (location first)'],
            ['item', 'Item only'],
            ['location', 'Location only'],
          ] as const).map(([m, label]) => (
            <button
              key={m}
              className={`erpnext-btn-secondary text-xs ${mode === m ? 'erpnext-btn-primary' : ''}`}
              onClick={() => setMode(m)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="erpnext-label">Scan / type code</label>
            {mode === 'item' ? (
              <ItemAutocomplete
                value={code}
                onSelect={(found) => { setCode(found.code); lookup(found.code) }}
                onChangeText={setCode}
                placeholder="ITEM-001"
                className="erpnext-input"
              />
            ) : (
              <input
                ref={inputRef}
                className="erpnext-input"
                value={code}
                onChange={e => setCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookup() } }}
                placeholder={mode === 'location' ? 'A-01-01-01 or INCOMING-01' : 'Scan item or location…'}
                autoFocus
              />
            )}
          </div>
          <button className="erpnext-btn-primary" onClick={() => lookup()} disabled={loading}>
            {loading ? 'Looking up…' : 'Lookup'}
          </button>
        </div>
      </div>

      {result?.kind === 'item' && (
        <div className="erpnext-card space-y-0">
          <div className="px-6 py-4 border-b flex flex-wrap gap-4 items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <div>
              <h2 className="text-lg font-semibold">{result.item?.code}</h2>
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>{result.item?.name || '—'}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {summary?.has_unallocatable && (
                <span className="erpnext-badge erpnext-badge-yellow">Has unallocatable</span>
              )}
              {summary?.has_allocatable && (
                <span className="erpnext-badge erpnext-badge-green">Has allocatable</span>
              )}
              {!summary?.has_allocatable && !summary?.has_unallocatable && (
                <span className="erpnext-badge">No stock</span>
              )}
            </div>
          </div>
          <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div style={{ color: 'var(--text-dim)' }}>Total</div>
              <div className="text-xl font-semibold">{summary?.total_qty ?? 0}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-dim)' }}>Allocatable</div>
              <div className="text-xl font-semibold" style={{ color: 'var(--green)' }}>{summary?.allocatable_qty ?? 0}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-dim)' }}>Unallocatable</div>
              <div className="text-xl font-semibold" style={{ color: 'var(--orange-700, #9c4621)' }}>{summary?.unallocatable_qty ?? 0}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-dim)' }}>Locations</div>
              <div className="text-xl font-semibold">{rows.length}</div>
            </div>
          </div>
          <div className="px-6 pb-6 overflow-x-auto">
            <table className="erpnext-table text-sm">
              <thead>
                <tr style={{ background: 'var(--panel-2)' }}>
                  <th>Location</th><th>Type</th><th>Batch</th><th className="text-right">Qty</th><th>Allocation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any) => (
                  <tr key={row.id}>
                    <td className="font-medium" style={{ color: 'var(--accent)' }}>{row.location_code}</td>
                    <td>{row.location_type}</td>
                    <td>{row.batch_no || '—'}</td>
                    <td className="text-right">{row.actual_qty}</td>
                    <td>{allocBadge(row.allocation_status)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-6" style={{ color: 'var(--text-dim)' }}>No stock for this item</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result?.kind === 'location' && (
        <div className="erpnext-card space-y-0">
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">{result.location?.code}</h2>
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
              {result.location?.location_type}
              {result.location?.aisle ? ` · Aisle ${result.location.aisle}` : ''}
              {result.location?.bay ? ` · Bay ${result.location.bay}` : ''}
              {result.location?.level ? ` · Level ${result.location.level}` : ''}
              {' · '}{result.item_count ?? rows.length} SKU(s)
            </p>
          </div>
          <div className="p-6 overflow-x-auto">
            <table className="erpnext-table text-sm">
              <thead>
                <tr style={{ background: 'var(--panel-2)' }}>
                  <th>Item</th><th>Name</th><th>Batch</th><th className="text-right">Qty</th><th>Allocation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any) => (
                  <tr key={row.id}>
                    <td className="font-medium" style={{ color: 'var(--accent)' }}>{row.item_code}</td>
                    <td>{row.item_name || '—'}</td>
                    <td>{row.batch_no || '—'}</td>
                    <td className="text-right">{row.actual_qty}</td>
                    <td>{allocBadge(row.allocation_status)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-6" style={{ color: 'var(--text-dim)' }}>Empty location</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
