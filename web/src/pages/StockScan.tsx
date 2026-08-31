import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Box, MapPin, ScanLine, Search } from 'lucide-react'
import { api } from '../services/api'
import BarcodeScanner from '../components/BarcodeScanner'
import ScanCard from '../components/scan/ScanCard'
import RfShell from '../components/RfShell'
import { notify } from '../components/Notifications'
import ItemAutocomplete from '../components/ItemAutocomplete'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'
import { useLoadMore } from '../hooks/useLoadMore'
import { useRfUi } from '../hooks/useRfUi'
import { parsePackedItemQR } from '../utils/parsePackedQR'
import { PageHead } from '../components/desktop/PageHead'
import { Card } from '../components/ui/Card'
import { Badge, statusToVariant } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'

type Mode = 'auto' | 'item' | 'location'

export default function StockScan() {
  const rf = useRfUi()
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

  const applyScanned = (scanned: string) => {
    if (mode === 'item') {
      const packed = parsePackedItemQR(scanned)
      if (packed) { void lookup(packed.itemCode); return }
    }
    void lookup(scanned)
  }

  const onScan = (scanned: string) => {
    setShowScanner(false)
    applyScanned(scanned)
  }

  const allocBadge = (status: string) => <Badge variant={statusToVariant(status)}>{status}</Badge>

  const summary = result?.summary
  const rows: any[] = result?.rows ?? []
  const pager = useClientPager(rows)
  const rfRowsMore = useLoadMore(rows, 10, `${result?.kind ?? ''}|${summary?.item_code ?? summary?.location_code ?? ''}|${rows.length}`)

  if (rf) {
    return (
      <RfShell title="Stock Scan">
        {showScanner && <BarcodeScanner onScan={onScan} onClose={() => setShowScanner(false)} />}

        <div className="scan-tabs">
          {([
            ['auto', 'Auto'],
            ['item', 'Item'],
            ['location', 'Location'],
          ] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              className={`scan-tab${mode === m ? ' active' : ''}`}
              onClick={() => { setMode(m); setResult(null) }}
            >
              {label}
            </button>
          ))}
        </div>

        <ScanCard
          state="idle"
          code={code}
          onManualEntry={(scanned) => applyScanned(scanned)}
          onMarkDamaged={() => {}}
          canMarkDamaged={false}
          showMarkDamaged={false}
          onRestart={() => { setCode(''); setResult(null) }}
          showActionRow={false}
          placeholder={
            mode === 'item' ? 'Scan item…' : mode === 'location' ? 'Scan location…' : 'Scan anything…'
          }
          idlePrompt={
            mode === 'item' ? 'Scan item label' : mode === 'location' ? 'Scan location label' : 'Scan any barcode'
          }
          readyTitle={mode === 'item' ? 'Item lookup' : mode === 'location' ? 'Location lookup' : 'Stock scan'}
        />

        {result?.kind === 'item' && (
          <>
            <div className="scan-section-card">
              <div className="scan-select-card-title">{result.item?.code}</div>
              <div className="scan-select-card-sub">{result.item?.name || '—'}</div>
              <div className="scan-stock-grid" style={{ marginTop: 10 }}>
                <div className="scan-stock-cell">
                  <div className="scan-stock-cell-label">Total</div>
                  <div className="scan-stock-cell-value">{summary?.total_qty ?? 0}</div>
                </div>
                <div className="scan-stock-cell">
                  <div className="scan-stock-cell-label">Allocatable</div>
                  <div className="scan-stock-cell-value" style={{ color: '#286840' }}>{summary?.allocatable_qty ?? 0}</div>
                </div>
                <div className="scan-stock-cell">
                  <div className="scan-stock-cell-label">Unalloc</div>
                  <div className="scan-stock-cell-value" style={{ color: '#9c4621' }}>{summary?.unallocatable_qty ?? 0}</div>
                </div>
                <div className="scan-stock-cell">
                  <div className="scan-stock-cell-label">Bins</div>
                  <div className="scan-stock-cell-value">{rows.length}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rfRowsMore.visible.map((row: any) => (
                <div key={row.id} className="scan-row">
                  <div className="scan-row-info">
                    <div className="scan-row-code">{row.location_code}</div>
                    <div className="scan-row-desc">
                      {row.location_type} · {row.batch_no || 'no batch'} · {row.allocation_status}
                    </div>
                  </div>
                  <div className="scan-row-meta">
                    <div className="scan-row-qty">{row.actual_qty}</div>
                    <div className="scan-row-label">qty</div>
                  </div>
                </div>
              ))}
              {rfRowsMore.hasMore && (
                <button type="button" className="scan-btn scan-btn-outline" onClick={rfRowsMore.loadMore}>
                  Load more ({rfRowsMore.remaining} left)
                </button>
              )}
              {rows.length === 0 && (
                <div className="scan-section-card" style={{ textAlign: 'center' }}>
                  <p style={{ fontWeight: 600, marginBottom: 6, color: 'var(--foreground)' }}>No stock</p>
                  <p style={{ color: 'var(--muted-foreground)', fontSize: 13, lineHeight: 1.4 }}>
                    This item has no location quantity.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {result?.kind === 'location' && (
          <>
            <div className="scan-section-card">
              <div className="scan-select-card-title">{result.location?.code}</div>
              <div className="scan-select-card-sub">
                {result.location?.location_type}
                {result.location?.aisle ? ` · Aisle ${result.location.aisle}` : ''}
                {result.location?.bay ? ` · Bay ${result.location.bay}` : ''}
                {result.location?.level ? ` · Level ${result.location.level}` : ''}
                {' · '}{result.item_count ?? rows.length} SKU(s)
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rfRowsMore.visible.map((row: any) => (
                <div key={row.id} className="scan-row">
                  <div className="scan-row-info">
                    <div className="scan-row-code">{row.item_code}</div>
                    <div className="scan-row-desc">
                      {row.item_name || '—'} · {row.batch_no || 'no batch'} · {row.allocation_status}
                    </div>
                  </div>
                  <div className="scan-row-meta">
                    <div className="scan-row-qty">{row.actual_qty}</div>
                    <div className="scan-row-label">qty</div>
                  </div>
                </div>
              ))}
              {rfRowsMore.hasMore && (
                <button type="button" className="scan-btn scan-btn-outline" onClick={rfRowsMore.loadMore}>
                  Load more ({rfRowsMore.remaining} left)
                </button>
              )}
              {rows.length === 0 && (
                <div className="scan-section-card" style={{ textAlign: 'center' }}>
                  <p style={{ fontWeight: 600, marginBottom: 6, color: 'var(--foreground)' }}>Empty location</p>
                  <p style={{ color: 'var(--muted-foreground)', fontSize: 13, lineHeight: 1.4 }}>
                    No items in this bin. Scan another code to look up stock.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {!result && (
          <div className="scan-section-card" style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: 600, marginBottom: 6, color: 'var(--foreground)' }}>Scan to look up</p>
            <p style={{ color: 'var(--muted-foreground)', fontSize: 13, lineHeight: 1.4 }}>
              Point the camera at an item or location barcode, or type a code and tap lookup.
            </p>
          </div>
        )}
      </RfShell>
    )
  }

  return (
    <div className="desk-page space-y-3">
      {showScanner && <BarcodeScanner onScan={onScan} onClose={() => setShowScanner(false)} />}

      <PageHead
        eyebrow="Stock"
        title="Stock Scan"
        subtitle="Item or location lookup"
        actions={
          <Button variant="outline" onClick={() => setShowScanner(true)}>
            <ScanLine size={14} /> Camera
          </Button>
        }
      />

      <Card className="p-3">
        <div className="desk-filter-bar" style={{ marginBottom: 0 }}>
          <div className="desk-chip-row">
            {([
              ['auto', 'Auto'],
              ['item', 'Item'],
              ['location', 'Location'],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                className={`erpnext-btn-secondary text-xs ${mode === m ? 'erpnext-btn-primary' : ''}`}
                onClick={() => setMode(m)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="desk-filter-search" style={{ minWidth: 180 }}>
            {mode === 'item' ? (
              <ItemAutocomplete
                value={code}
                onSelect={(found) => { setCode(found.code); lookup(found.code) }}
                onChangeText={(t) => {
                  const packed = parsePackedItemQR(t)
                  setCode(packed ? packed.itemCode : t)
                }}
                placeholder="ITEM-001"
                className="erpnext-input"
              />
            ) : (
              <input
                ref={inputRef}
                className="erpnext-input desk-filter-search"
                style={{ width: '100%' }}
                value={code}
                onChange={e => setCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookup() } }}
                placeholder={mode === 'location' ? 'A-01-01-01' : 'Scan item or location…'}
                autoFocus
              />
            )}
          </div>
          <Button onClick={() => lookup()} disabled={loading}>
            {loading ? 'Looking up…' : 'Lookup'}
          </Button>
        </div>
      </Card>

      {result?.kind === 'item' && (
        <Card className="space-y-0" style={{ padding: 0 } as any}>
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
          <div className="px-6 pb-6">
            <div className="mb-3">
              <ListPager pager={pager} placeholder="Search stock…" />
            </div>
            <div className="table-wrap">
              <table className="erpnext-table text-sm">
                <thead>
                  <tr style={{ background: 'var(--panel-2)' }}>
                    <th>Location</th><th>Type</th><th>Batch</th><th className="text-right">Qty</th><th>Allocation</th>
                  </tr>
                </thead>
                <tbody>
                  {pager.pageItems.map((row: any) => (
                    <tr key={row.id}>
                      <td className="font-medium" style={{ color: 'var(--accent)' }}>{row.location_code}</td>
                      <td>{row.location_type}</td>
                      <td>{row.batch_no || '—'}</td>
                      <td className="text-right">{row.actual_qty}</td>
                      <td>{allocBadge(row.allocation_status)}</td>
                    </tr>
                  ))}
                  {pager.total === 0 && (
                    <tr><td colSpan={5} className="text-center py-6" style={{ color: 'var(--text-dim)' }}>No stock for this item</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
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
          <div className="p-6">
            <div className="mb-3">
              <ListPager pager={pager} placeholder="Search items…" />
            </div>
            <div className="table-wrap">
              <table className="erpnext-table text-sm">
                <thead>
                  <tr style={{ background: 'var(--panel-2)' }}>
                    <th>Item</th><th>Name</th><th>Batch</th><th className="text-right">Qty</th><th>Allocation</th>
                  </tr>
                </thead>
                <tbody>
                  {pager.pageItems.map((row: any) => (
                    <tr key={row.id}>
                      <td className="font-medium" style={{ color: 'var(--accent)' }}>{row.item_code}</td>
                      <td>{row.item_name || '—'}</td>
                      <td>{row.batch_no || '—'}</td>
                      <td className="text-right">{row.actual_qty}</td>
                      <td>{allocBadge(row.allocation_status)}</td>
                    </tr>
                  ))}
                  {pager.total === 0 && (
                    <tr><td colSpan={5} className="text-center py-6" style={{ color: 'var(--text-dim)' }}>Empty location</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
