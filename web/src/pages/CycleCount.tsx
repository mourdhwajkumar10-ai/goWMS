import { useEffect, useState } from 'react'
import { ArrowLeft, Plus, Search } from 'lucide-react'
import { api } from '../services/api'
import BarcodeScanner from '../components/BarcodeScanner'
import ScanCard from '../components/scan/ScanCard'
import Comments from '../components/Comments'
import { notify } from '../components/Notifications'
import ItemAutocomplete from '../components/ItemAutocomplete'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'
import { useLoadMore } from '../hooks/useLoadMore'
import { useRfUi } from '../hooks/useRfUi'
import RfShell from '../components/RfShell'
import { parsePackedItemQR } from '../utils/parsePackedQR'
import '../styles/scanner.css'

interface Sheet {
  id: number
  sheet_no: string
  warehouse_id: number | null
  tier: string | null
  scheduled_date: string | null
  status: string | null
  created_at: string
}

interface CountLine {
  id: number
  item_code: string
  system_qty: number
  counted_qty: number | null
  discrepancy_status: string | null
}

export default function CycleCount() {
  const rf = useRfUi()
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [selectedSheet, setSelectedSheet] = useState<any>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [msg, setMsg] = useState('')
  const [rfQuery, setRfQuery] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [countDrafts, setCountDrafts] = useState<Record<number, string>>({})

  const [tier, setTier] = useState('A')
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().slice(0, 10))
  const [warehouse, setWarehouse] = useState('')
  const [aisle, setAisle] = useState('')
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [autoGen, setAutoGen] = useState(true)

  const [addItemCode, setAddItemCode] = useState('')
  const [addSystemQty, setAddSystemQty] = useState('')

  const loadSheets = () => api.cycleCountSheets().then(r => { if (r.ok) setSheets(r.data ?? []) })
  useEffect(() => {
    loadSheets()
    api.warehouseList().then(r => { if (r.ok) setWarehouses(r.data ?? []) })
  }, [])
  const pager = useClientPager(sheets)

  const createSheet = async () => {
    const r = await api.cycleCountCreate({
      tier,
      scheduled_date: scheduledDate || undefined,
      warehouse_id: warehouse ? +warehouse : undefined,
      aisle: aisle || undefined,
      auto_generate: autoGen && !!warehouse,
    })
    if (r.ok) {
      setMsg(`Sheet ${r.data.sheet_no} created${r.data.lines_generated ? ` · ${r.data.lines_generated} bins` : ''}`)
      setTier('A'); setScheduledDate(''); setAisle('')
      loadSheets()
      notify({ type: 'success', title: 'Sheet Created', message: r.data.sheet_no })
      if (r.data.id) openSheet(r.data.id)
    }
  }

  const openSheet = async (id: number) => {
    const r = await api.get(`/cyclecount/${id}`)
    if (r.ok) setSelectedSheet(r.data)
  }

  const handleScan = (code: string) => {
    setShowScanner(false)
    // Case-label QRs arrive as "itemcode-qty_price"; pull just the item code
    // so the count line is keyed correctly. Location codes (no underscore)
    // don't match and are kept as-is.
    const packed = parsePackedItemQR(code)
    setAddItemCode(packed ? packed.itemCode : code)
  }

  const addLine = async () => {
    if (!addItemCode || !selectedSheet) return
    const r = await api.post(`/cyclecount/${selectedSheet.id}/line`, {
      item_code: addItemCode,
      system_qty: +addSystemQty || 0,
    })
    if (r.ok) {
      notify({ type: 'success', title: 'Line Added', message: addItemCode })
      setAddItemCode(''); setAddSystemQty('')
      openSheet(selectedSheet.id)
    }
  }

  const submitCount = async (lineId: number, qty: number) => {
    const r = await api.post(`/cyclecount/line/${lineId}/count`, { counted_qty: qty })
    if (r.ok) {
      notify({ type: 'success', title: 'Count Recorded', message: `Qty: ${qty}` })
      openSheet(selectedSheet.id)
    }
  }

  const completeSheet = async () => {
    if (!selectedSheet) return
    const apply = window.confirm('Apply qty adjustments to location stock for discrepancies?')
    const r = await api.post<{ adjustments_applied?: number }>(`/cyclecount/${selectedSheet.id}/complete`, { apply_adjustments: apply })
    if (r.ok) {
      notify({
        type: 'success',
        title: 'Sheet Completed',
        message: apply ? `${r.data?.adjustments_applied || 0} adjustments applied` : 'Closed without adjustments',
      })
      setSelectedSheet(null)
      loadSheets()
    }
  }

  const statusBadge = (status: string) => {
    const cls = status === 'completed' ? 'erpnext-badge-green' :
                status === 'in_progress' ? 'erpnext-badge-blue' :
                'erpnext-badge-yellow'
    return <span className={`erpnext-badge ${cls}`}>{status}</span>
  }

  const rfSheets = pager.filtered.filter(s => {
    const q = rfQuery.trim().toLowerCase()
    if (!q) return true
    return `${s.sheet_no} ${s.tier || ''} ${s.status || ''}`.toLowerCase().includes(q)
  })
  const rfSheetMore = useLoadMore(rfSheets, 10, `${rfQuery}|${rfSheets.length}`)

  const countedStat = selectedSheet
    ? String((selectedSheet.lines || []).filter((l: CountLine) => l.counted_qty != null).length)
    : String(sheets.filter(s => (s.status || '').toLowerCase() === 'completed').length)
  const countedOf = selectedSheet ? `/ ${(selectedSheet.lines || []).length}` : undefined

  if (rf) {
    return (
      <RfShell
        title="Cycle Count"
        stat={countedStat}
        statOf={countedOf}
        meta={selectedSheet ? selectedSheet.sheet_no : undefined}
      >
        {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

        {!selectedSheet ? (
          <>
            <div className="scan-bottom-bar">
              <div className="scan-input-chip">
                <Search size={16} strokeWidth={1.8} />
                <input
                  type="search"
                  value={rfQuery}
                  onChange={e => setRfQuery(e.target.value)}
                  placeholder="Search sheets…"
                  autoComplete="off"
                />
              </div>
              <button
                type="button"
                className="scan-icon-btn primary"
                onClick={() => setShowNew(!showNew)}
                aria-label="New sheet"
              >
                <Plus size={18} strokeWidth={1.8} />
              </button>
            </div>

            {showNew && (
              <div className="scan-section-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="scan-section-title">Create count sheet</div>
                <select className="scan-count-input" value={tier} onChange={e => setTier(e.target.value)}>
                  <option value="A">A (Fast)</option>
                  <option value="B">B (Medium)</option>
                  <option value="C">C (Slow)</option>
                </select>
                <input className="scan-count-input" type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
                <select className="scan-count-input" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
                  <option value="">Warehouse</option>
                  {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.code}</option>)}
                </select>
                <input className="scan-count-input" value={aisle} onChange={e => setAisle(e.target.value)} placeholder="Aisle (optional)" />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={autoGen} onChange={e => setAutoGen(e.target.checked)} />
                  Auto-fill from location stock
                </label>
                <button type="button" className="scan-btn scan-btn-primary" onClick={() => { void createSheet(); setShowNew(false) }}>Create sheet</button>
                <button type="button" className="scan-btn scan-btn-outline" onClick={() => setShowNew(false)}>Cancel</button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rfSheetMore.visible.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className="scan-select-card"
                  onClick={() => openSheet(s.id)}
                  style={{ textAlign: 'left', width: '100%', cursor: 'pointer' }}
                >
                  <div className="scan-select-card-title">{s.sheet_no}</div>
                  <div className="scan-select-card-sub">
                    Tier {s.tier || '—'} · {s.scheduled_date ? new Date(s.scheduled_date).toLocaleDateString() : 'unscheduled'}
                  </div>
                  <div className="scan-select-card-meta">
                    <span>{s.status || 'pending'}</span>
                    <span style={{ color: 'var(--primary)' }}>Open to count →</span>
                  </div>
                </button>
              ))}
              {rfSheetMore.hasMore && (
                <button type="button" className="scan-btn scan-btn-outline" onClick={rfSheetMore.loadMore}>
                  Load more ({rfSheetMore.remaining} left)
                </button>
              )}
              {rfSheets.length === 0 && (
                <div className="scan-section-card" style={{ textAlign: 'center' }}>
                  <p style={{ fontWeight: 600, marginBottom: 6, color: 'var(--foreground)' }}>No sheets yet</p>
                  <button type="button" className="scan-btn scan-btn-primary" onClick={() => setShowNew(true)}>
                    <Plus size={16} /> New sheet
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <button type="button" className="scan-btn scan-btn-outline" onClick={() => setSelectedSheet(null)} style={{ alignSelf: 'flex-start', width: 'auto' }}>
              <ArrowLeft size={16} strokeWidth={1.8} /> Back to sheets
            </button>

            <div className="scan-section-card">
              <div className="scan-select-card-title">{selectedSheet.sheet_no}</div>
              <div className="scan-select-card-sub">Tier {selectedSheet.tier} · {selectedSheet.status}</div>
            </div>

            {selectedSheet.status !== 'completed' && (
              <button type="button" className="scan-btn scan-btn-primary" onClick={() => void completeSheet()}>
                Complete sheet
              </button>
            )}

            <ScanCard
              state="idle"
              code={addItemCode}
              onManualEntry={(raw) => {
                const packed = parsePackedItemQR(raw)
                setAddItemCode(packed ? packed.itemCode : raw)
              }}
              onMarkDamaged={() => {}}
              canMarkDamaged={false}
              showMarkDamaged={false}
              onRestart={() => setAddItemCode('')}
              showActionRow={false}
              placeholder="Item code…"
              readyTitle="Add count line"
              readySubtitle={selectedSheet.sheet_no}
            />

            <div style={{ display: 'flex', gap: 8, padding: '0 var(--scan-pad-x, 16px)' }}>
              <input
                className="scan-count-input"
                style={{ width: 88 }}
                type="number"
                value={addSystemQty}
                onChange={e => setAddSystemQty(e.target.value)}
                placeholder="Sys qty"
              />
              <button type="button" className="scan-btn scan-btn-primary" style={{ flex: 1 }} onClick={() => void addLine()}>
                Add line
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(selectedSheet.lines || []).map((line: any) => {
                const done = line.counted_qty != null
                const variance = done ? line.counted_qty - line.system_qty : null
                return (
                  <div key={line.id} className="scan-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <div className={`scan-row-check${done ? ' done' : ''}`}>{done ? '✓' : ''}</div>
                    <div className="scan-row-info" style={{ flex: 1 }}>
                      <div className="scan-row-code">{line.item_code}</div>
                      <div className="scan-row-desc">
                        {line.location_code || '—'} · sys {line.system_qty}
                        {variance != null ? ` · var ${variance > 0 ? '+' : ''}${variance}` : ''}
                      </div>
                    </div>
                    <div className="scan-row-meta">
                      <div className="scan-row-qty">{done ? line.counted_qty : '—'}</div>
                      <div className="scan-row-label">{line.discrepancy_status || (done ? 'counted' : 'pending')}</div>
                    </div>
                    {!done && selectedSheet.status !== 'completed' && (
                      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                        <input
                          className="scan-count-input"
                          style={{ flex: 1 }}
                          type="number"
                          placeholder="Count qty"
                          value={countDrafts[line.id] ?? ''}
                          onChange={e => setCountDrafts(d => ({ ...d, [line.id]: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              const qty = +(countDrafts[line.id] || (e.target as HTMLInputElement).value)
                              if (!Number.isNaN(qty)) {
                                void submitCount(line.id, qty)
                                setCountDrafts(d => { const n = { ...d }; delete n[line.id]; return n })
                              }
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="scan-btn scan-btn-primary scan-btn-sm"
                          style={{ width: 'auto' }}
                          onClick={() => {
                            const qty = +(countDrafts[line.id] || 0)
                            if (!Number.isNaN(qty)) {
                              void submitCount(line.id, qty)
                              setCountDrafts(d => { const n = { ...d }; delete n[line.id]; return n })
                            }
                          }}
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </RfShell>
    )
  }

  return (
    <div className="desk-page space-y-3">
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cycle Count</h2>
        <button onClick={() => setShowScanner(true)} className="erpnext-btn-secondary">📷 Scan Item</button>
      </div>

      {!selectedSheet ? (
        <>
          <div className="erpnext-card">
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-semibold">Create Count Sheet</h3>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="erpnext-label">Tier (ABC)</label>
                  <select className="erpnext-input" value={tier} onChange={e => setTier(e.target.value)}>
                    <option value="A">A (Fast)</option>
                    <option value="B">B (Medium)</option>
                    <option value="C">C (Slow)</option>
                  </select>
                </div>
                <div>
                  <label className="erpnext-label">Scheduled Date</label>
                  <input className="erpnext-input" type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
                </div>
                <div>
                  <label className="erpnext-label">Warehouse</label>
                  <select className="erpnext-input" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
                    <option value="">Select</option>
                    {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="erpnext-label">Aisle (optional)</label>
                  <input className="erpnext-input" value={aisle} onChange={e => setAisle(e.target.value)} placeholder="A" />
                </div>
                <div className="flex items-center gap-2 md:col-span-2">
                  <input type="checkbox" id="autogen" checked={autoGen} onChange={e => setAutoGen(e.target.checked)} className="w-4 h-4" />
                  <label htmlFor="autogen" className="text-sm">Auto-fill from location stock</label>
                </div>
                <div className="flex items-end md:col-span-2">
                  <button onClick={createSheet} className="erpnext-btn-primary w-full">Create Sheet</button>
                </div>
              </div>
            </div>
          </div>

          {msg && (
            <div style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', color: 'var(--green)', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
              {msg}
            </div>
          )}

          <div className="erpnext-card">
            <div className="px-4 py-3 space-y-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-semibold">Count Sheets</h3>
              <ListPager pager={pager} placeholder="Search sheets…" />
            </div>
            <div className="table-wrap">
              <table className="erpnext-table">
                <thead>
                  <tr><th>Sheet No</th><th>Tier</th><th>Scheduled</th><th>Status</th><th>Created</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {pager.pageItems.map(s => (
                    <tr key={s.id}>
                      <td className="font-medium cursor-pointer hover:underline" style={{ color: 'var(--accent)' }} onClick={() => openSheet(s.id)}>{s.sheet_no}</td>
                      <td>{s.tier || '—'}</td>
                      <td>{s.scheduled_date ? new Date(s.scheduled_date).toLocaleDateString() : '—'}</td>
                      <td>{statusBadge(s.status || 'pending')}</td>
                      <td>{new Date(s.created_at).toLocaleDateString()}</td>
                      <td>
                        <button onClick={() => openSheet(s.id)} className="erpnext-btn-secondary text-xs">Open</button>
                      </td>
                    </tr>
                  ))}
                  {pager.total === 0 && <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No sheets</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="erpnext-card">
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h3 className="font-semibold">{selectedSheet.sheet_no}</h3>
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Tier: {selectedSheet.tier} | Status: {selectedSheet.status}</p>
            </div>
            <div className="flex gap-2">
              {selectedSheet.status !== 'completed' && (
                <button onClick={completeSheet} className="erpnext-btn-primary text-sm">Complete</button>
              )}
              <button onClick={() => setSelectedSheet(null)} className="erpnext-btn-secondary">Back</button>
            </div>
          </div>

          <div className="p-4">
            <h4 className="font-medium text-sm mb-2">Add Item to Count</h4>
            <div className="flex gap-2">
              <ItemAutocomplete
                value={addItemCode}
                onSelect={(found) => setAddItemCode(found.code)}
                onChangeText={(t) => {
                  const packed = parsePackedItemQR(t)
                  setAddItemCode(packed ? packed.itemCode : t)
                }}
                placeholder="Item code"
                className="erpnext-input"
              />
              <input className="erpnext-input" type="number" value={addSystemQty} onChange={e => setAddSystemQty(e.target.value)} placeholder="System qty" />
              <button onClick={() => setShowScanner(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>📷</button>
              <button onClick={addLine} className="erpnext-btn-primary">Add</button>
            </div>

            {selectedSheet.lines && selectedSheet.lines.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-sm mb-2">Count Lines ({selectedSheet.lines.length})</h4>
                <div className="table-wrap">
                  <table className="erpnext-table text-sm">
                    <thead>
                      <tr><th>Location</th><th>Item</th><th>System Qty</th><th>Counted Qty</th><th>Variance</th><th>Status</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      {selectedSheet.lines.map((line: any) => {
                        const variance = line.counted_qty !== null && line.counted_qty !== undefined ? line.counted_qty - line.system_qty : null
                        return (
                          <tr key={line.id}>
                            <td className="text-xs">{line.location_code || '—'}</td>
                            <td className="font-medium">{line.item_code}</td>
                            <td>{line.system_qty}</td>
                            <td>{line.counted_qty ?? '—'}</td>
                            <td>
                              {variance !== null ? (
                                <span style={{ color: variance === 0 ? 'var(--green)' : 'var(--red)' }}>
                                  {variance > 0 ? '+' : ''}{variance}
                                </span>
                              ) : '—'}
                            </td>
                            <td>
                              {line.discrepancy_status && (
                                <span className={`erpnext-badge ${line.discrepancy_status === 'match' ? 'erpnext-badge-green' : 'erpnext-badge-red'}`}>
                                  {line.discrepancy_status}
                                </span>
                              )}
                            </td>
                            <td>
                              {line.counted_qty === null && selectedSheet.status !== 'completed' && (
                                <input
                                  className="erpnext-input text-sm"
                                  type="number"
                                  placeholder="Count"
                                  style={{ width: 80 }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      submitCount(line.id, +(e.target as HTMLInputElement).value)
                                      ;(e.target as HTMLInputElement).value = ''
                                    }
                                  }}
                                />
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
            <Comments entityType="cycle_count_sheet" entityId={selectedSheet.id} />
          </div>
        </div>
      )}
    </div>
  )
}
