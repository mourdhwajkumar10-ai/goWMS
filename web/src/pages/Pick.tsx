import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckSquare, MapPin, Plus, ScanLine, Search } from 'lucide-react'
import { api } from '../services/api'
import BarcodeScanner from '../components/BarcodeScanner'
import Comments from '../components/Comments'
import GuidedPickJob from '../components/GuidedPickJob'
import { notify } from '../components/Notifications'
import ItemAutocomplete, { withTrailingEmptyRow, stripTrailingEmptyRows } from '../components/ItemAutocomplete'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'
import { useLoadMore } from '../hooks/useLoadMore'
import { useRfUi } from '../hooks/useRfUi'
import { parsePackedItemQR } from '../utils/parsePackedQR'
import { PageHead } from '../components/desktop/PageHead'
import { Badge, statusToVariant } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import ScannerLayout, { useScannerToasts, ScannerToastBar } from '../components/ScannerLayout'
import CameraScanner from '../components/CameraScanner'
import '../styles/scanner.css'

interface PickList {
  id: number
  name: string
  sales_order_no: string | null
  status: string | null
  picking_mode: string | null
  fulfillment_type?: string | null
  total_qty: number
  picked_qty: number
  allocated_qty?: number
  customer: string | null
  warehouse_id?: number | null
}

interface PickItem {
  id: number
  item_code: string
  item_name: string
  qty: number
  ordered_qty: number
  picked_qty: number
  allocated_qty: number
  bin_location: string
  location_code: string
  batch_no?: string
  expiry_date?: string | null
  fefo_badge?: string | null
  status: string
}

export default function Pick() {
  const shellRf = useRfUi()
  const [searchParams, setSearchParams] = useSearchParams()
  const forceRf = searchParams.get('rf') === '1' || searchParams.get('mode') === 'rf'
  const rf = shellRf || forceRf
  const { toasts } = useScannerToasts()
  const [lists, setLists] = useState<PickList[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [selectedList, setSelectedList] = useState<any>(null)
  const [showNew, setShowNew] = useState(false)
  const [msg, setMsg] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [scanTarget, setScanTarget] = useState<'item' | 'bin'>('item')
  const [rfQuery, setRfQuery] = useState('')

  const [salesOrder, setSalesOrder] = useState('')
  const [customer, setCustomer] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [items, setItems] = useState<{ item_code: string; qty: number }[]>([{ item_code: '', qty: 1 }])
  const emptyPickLine = () => ({ item_code: '', qty: 1 })
  const pickFilled = (r: { item_code: string }) => !!r.item_code.trim()
  const setPickLines = (next: { item_code: string; qty: number }[]) =>
    setItems(withTrailingEmptyRow(next, pickFilled, emptyPickLine))

  const [showWave, setShowWave] = useState(false)
  const [waveSOIds, setWaveSOIds] = useState('')
  const [confirmedSOs, setConfirmedSOs] = useState<any[]>([])

  const [scanItem, setScanItem] = useState('')
  const [scanBin, setScanBin] = useState('')
  const [scanQty, setScanQty] = useState('1')
  const [scanLineId, setScanLineId] = useState<number | null>(null)

  const loadLists = () => api.pickLists().then(r => { if (r.ok) setLists(r.data ?? []) })
  useEffect(() => {
    loadLists()
    api.warehouseList().then(r => { if (r.ok) setWarehouses(r.data ?? []) })
    api.soList('status=confirmed').then(r => { if (r.ok) setConfirmedSOs(r.data ?? []) })
  }, [])

  const enterRfPick = (listId?: number | null) => {
    const next = new URLSearchParams(searchParams)
    next.set('rf', '1')
    if (listId) next.set('list', String(listId))
    setSearchParams(next, { replace: false })
  }

  const exitRfPick = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('rf')
    next.delete('mode')
    setSearchParams(next, { replace: true })
  }

  const pager = useClientPager(lists)

  const createWave = async () => {
    const ids = waveSOIds.split(/[,\s]+/).map(s => +s).filter(n => n > 0)
    if (!ids.length) {
      notify({ type: 'error', title: 'Need SO ids', message: 'Enter confirmed sales order IDs' })
      return
    }
    const r = await api.pickWave({
      sales_order_ids: ids,
      warehouse_id: warehouseId ? +warehouseId : undefined,
    })
    if (r.ok) {
      notify({ type: 'success', title: 'Wave created', message: r.data.name })
      setShowWave(false); setWaveSOIds('')
      loadLists(); enterRfPick(r.data.id)
    } else notify({ type: 'error', title: 'Wave failed', message: r.error || '' })
  }

  const addItem = () => {
    setPickLines([...items, emptyPickLine()])
  }

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...items]
    ;(updated[idx] as any)[field] = value
    setPickLines(updated)
  }

  // A hardware scanner dumps the whole case-label QR (e.g. "DK151094-1_210")
  // into the Item Code field. Split it so item_code and qty are populated
  // correctly. Location scans (no underscore) don't match and fall through
  // to plain text entry.
  const applyPickPackedQR = (idx: number, packed: { itemCode: string; qty: number; rate: number }) => {
    setPickLines(items.map((row, i) => i === idx ? { ...row, item_code: packed.itemCode, qty: packed.qty } : row))
    void (async () => {
      const r = await api.itemSuggest(packed.itemCode, 12)
      if (r.ok && r.data?.length) {
        const found = r.data.find((i: any) => String(i.code).toUpperCase() === packed.itemCode.toUpperCase()) || r.data[0]
        notify({ type: 'success', title: 'QR item found', message: `${found.code} · qty ${packed.qty}` })
      } else {
        notify({ type: 'warning', title: 'Item code not found', message: `${packed.itemCode} · qty ${packed.qty}` })
      }
    })()
  }

  const removeItem = (idx: number) => {
    const next = items.filter((_, i) => i !== idx)
    setPickLines(next.length ? next : [emptyPickLine()])
  }

  const createList = async () => {
    const valid = stripTrailingEmptyRows(items, pickFilled)
    if (!valid.length) return
    const r = await api.post<any>('/picking/', {
      sales_order_no: salesOrder,
      customer,
      warehouse_id: warehouseId ? +warehouseId : undefined,
      items: valid.map(i => ({
        item_code: i.item_code,
        ordered_qty: i.qty,
        qty: i.qty,
      })),
    })
    if (r.ok) {
      setMsg(`Pick list created: ${r.data.name} (FEFO allocated)`)
      setShowNew(false)
      resetForm()
      loadLists()
      notify({ type: 'success', title: 'Pick List Created', message: `${r.data.name} — stock reserved` })
      enterRfPick(r.data.id)
    } else {
      notify({ type: 'error', title: 'Allocate failed', message: r.error || 'Could not create pick list' })
    }
  }

  const resetForm = () => {
    setSalesOrder(''); setCustomer(''); setWarehouseId(''); setItems([emptyPickLine()])
  }

  const openList = async (id: number) => {
    const r = await api.get(`/picking/${id}`)
    if (r.ok) setSelectedList(r.data)
  }

  const openListDesk = (id: number) => {
    const next = new URLSearchParams(searchParams)
    next.set('list', String(id))
    next.delete('rf')
    next.delete('mode')
    setSearchParams(next, { replace: false })
    void openList(id)
  }

  const clearSelectedList = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('list')
    next.delete('id')
    setSearchParams(next, { replace: true })
    setSelectedList(null)
  }

  const listIdParam = searchParams.get('list') || searchParams.get('id')
  useEffect(() => {
    const id = listIdParam ? Number(listIdParam) : 0
    if (id > 0) void openList(id)
    else setSelectedList(null)
    // Deep-link / post-create navigation: reopen when ?list= changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listIdParam])

  const handleScan = (code: string) => {
    setShowScanner(false)
    if (scanTarget === 'item') setScanItem(code)
    else setScanBin(code)
  }

  const selectLine = (pi: PickItem) => {
    setScanLineId(pi.id)
    setScanItem(pi.item_code)
    setScanBin(pi.location_code || pi.bin_location || '')
    setScanQty(String(Math.max(1, (pi.allocated_qty || pi.qty) - pi.picked_qty)))
  }

  const logScan = async () => {
    if (!scanItem || !selectedList) return
    const currentLineId = scanLineId
    const expected = selectedList.items?.find((x: PickItem) => x.id === scanLineId)?.location_code
      || selectedList.items?.find((x: PickItem) => x.item_code === scanItem && x.status !== 'picked' && x.status !== 'shortage')?.location_code
      || ''
    const r = await api.pickScan({
      pick_list_id: selectedList.id,
      pick_list_item_id: scanLineId || undefined,
      item_code: scanItem,
      scanned_bin: scanBin,
      expected_bin: expected,
      quantity: +scanQty || 1,
    })
    if (r.ok) {
      const drift = r.data?.location_drift ? ' (location drift)' : ''
      notify({
        type: r.data?.location_drift ? 'warning' : 'success',
        title: 'Item Picked',
        message: `${scanItem}: ${scanQty} units${drift}`,
      })
      const detail = await api.get<any>(`/picking/${selectedList.id}`)
      if (detail.ok && detail.data) {
        setSelectedList(detail.data)
        const items: PickItem[] = detail.data.items || []
        const nextLine = items.find(
          (x: PickItem) => x.status !== 'picked' && x.status !== 'shortage' && x.status !== 'delivered'
            && (currentLineId == null || x.id > currentLineId)
        ) || items.find(
          (x: PickItem) => x.status !== 'picked' && x.status !== 'shortage' && x.status !== 'delivered'
        )
        if (nextLine) {
          selectLine(nextLine)
        } else {
          setScanItem(''); setScanBin(''); setScanQty('1'); setScanLineId(null)
        }
      } else {
        setScanItem(''); setScanBin(''); setScanQty('1'); setScanLineId(null)
        openList(selectedList.id)
      }
      loadLists()
    } else {
      notify({ type: 'error', title: 'Pick failed', message: r.error || 'Scan rejected' })
    }
  }

  const statusBadge = (status: string) => <Badge variant={statusToVariant(status)}>{status}</Badge>

  const fefoBadge = (badge?: string | null) => {
    if (!badge || badge === 'ok') return null
    return <Badge variant={badge === 'expired' ? 'red' : 'yellow'} className="ml-1">{badge}</Badge>
  }

  const pickedStat = selectedList
    ? `${selectedList.picked_qty ?? 0}`
    : String(lists.filter(l => (l.status || '').toLowerCase() === 'completed').length)
  const pickedOf = selectedList ? `/ ${selectedList.total_qty ?? 0}` : undefined

  const rfLists = pager.filtered.filter(l => {
    const q = rfQuery.trim().toLowerCase()
    if (!q) return true
    return `${l.name} ${l.sales_order_no || ''} ${l.customer || ''} ${l.status || ''}`.toLowerCase().includes(q)
  })
  const rfListMore = useLoadMore(rfLists, 10, `${rfQuery}|${rfLists.length}`)

  if (rf) {
    return (
      <ScannerLayout
        title="Picking"
        stat={pickedStat}
        statOf={pickedOf}
        meta={selectedList ? selectedList.name : undefined}
        hideHeader={false}
      >
        <ScannerToastBar toasts={toasts} />
        {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

        {forceRf && !shellRf && (
          <button
            type="button"
            className="scan-btn scan-btn-outline"
            style={{ alignSelf: 'flex-start', width: 'auto', marginBottom: 8 }}
            onClick={exitRfPick}
          >
            <ArrowLeft size={14} /> Desk list
          </button>
        )}

        {!selectedList ? (
          <>
            <div className="scan-bottom-bar">
              <div className="scan-input-chip">
                <Search size={16} strokeWidth={1.8} />
                <input
                  type="search"
                  value={rfQuery}
                  onChange={e => setRfQuery(e.target.value)}
                  placeholder="Search pick lists…"
                  autoComplete="off"
                />
              </div>
              <button
                type="button"
                className="scan-icon-btn primary"
                onClick={() => { setShowNew(!showNew); setShowWave(false) }}
                aria-label="New pick list"
              >
                <Plus size={18} strokeWidth={1.8} />
              </button>
            </div>

            {showNew && (
              <div className="scan-section-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="scan-section-title">New pick list</div>
                <input className="scan-count-input" value={salesOrder} onChange={e => setSalesOrder(e.target.value)} placeholder="Sales order" />
                <input className="scan-count-input" value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Customer" />
                <select className="scan-count-input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                  <option value="">Default warehouse</option>
                  {warehouses.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.code || w.name}</option>
                  ))}
                </select>
                {items.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <ItemAutocomplete
                        value={item.item_code}
                        onSelect={(found) => {
                          const u = [...items]
                          u[idx] = { ...u[idx], item_code: found.code }
                          setPickLines(u)
                        }}
                        onChangeText={(t) => {
                          const packed = parsePackedItemQR(t)
                          if (packed) applyPickPackedQR(idx, packed)
                          else updateItem(idx, 'item_code', t)
                        }}
                      />
                    </div>
                    <input
                      className="scan-count-input"
                      style={{ width: 72 }}
                      type="number"
                      value={item.qty}
                      onChange={e => updateItem(idx, 'qty', +e.target.value)}
                    />
                  </div>
                ))}
                <button type="button" className="scan-btn scan-btn-primary" onClick={createList}>Allocate &amp; create</button>
                <button type="button" className="scan-btn scan-btn-outline" onClick={() => { setShowNew(false); resetForm() }}>Cancel</button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rfListMore.visible.map(l => (
                <button
                  key={l.id}
                  type="button"
                  className="scan-select-card"
                  onClick={() => enterRfPick(l.id)}
                  style={{ textAlign: 'left', width: '100%', cursor: 'pointer' }}
                >
                  <div className="scan-select-card-title">{l.name}</div>
                  <div className="scan-select-card-sub">{l.sales_order_no || 'No SO'} · {l.customer || '—'}</div>
                  <div className="scan-select-card-meta">
                    <span>{l.status || 'pending'}</span>
                    <span>{l.picked_qty}/{l.total_qty}</span>
                    <span style={{ color: 'var(--primary)' }}>Open to scan →</span>
                  </div>
                </button>
              ))}
              {rfListMore.hasMore && (
                <button type="button" className="scan-btn scan-btn-outline" onClick={rfListMore.loadMore}>
                  Load more ({rfListMore.remaining} left)
                </button>
              )}
              {rfLists.length === 0 && (
                <div className="scan-section-card" style={{ textAlign: 'center' }}>
                  <p style={{ fontWeight: 600, marginBottom: 6, color: 'var(--foreground)' }}>No pick lists yet</p>
                  <p style={{ color: 'var(--muted-foreground)', fontSize: 13, marginBottom: 12, lineHeight: 1.4 }}>
                    On Sales Orders: Confirm the order, then Create Pick. FEFO reserves stock and the list appears here.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Link to="/sales-orders" className="scan-btn scan-btn-primary" style={{ textDecoration: 'none' }}>
                      Go to Sales Orders
                    </Link>
                    <button
                      type="button"
                      className="scan-btn scan-btn-outline"
                      onClick={() => { setShowNew(true); setShowWave(false) }}
                    >
                      <Plus size={16} /> Free-form pick list
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <button type="button" className="scan-btn scan-btn-outline" onClick={clearSelectedList} style={{ alignSelf: 'flex-start', width: 'auto' }}>
              <ArrowLeft size={16} strokeWidth={1.8} /> Back to lists
            </button>

            {selectedList.fulfillment_type ? (
              <GuidedPickJob
                pickListId={selectedList.id}
                hideCustomer={selectedList.fulfillment_type === 'wave' || selectedList.picking_mode === 'wave'}
                onExit={clearSelectedList}
                onComplete={(data) => setSelectedList(data)}
              />
            ) : (
              <>
            <div className="scan-section-card">
              <div className="scan-select-card-title">{selectedList.name}</div>
              <div className="scan-select-card-sub">
                {selectedList.sales_order_no || '—'} · {selectedList.customer || 'No customer'}
              </div>
            </div>

            <div className="scan-live-viewport" style={{ borderRadius: 12, overflow: 'hidden', minHeight: 200 }}>
              <CameraScanner
                open
                embedded
                minimal
                continuous
                onClose={() => {}}
                onScan={(code) => {
                  const clean = String(code || '').trim()
                  if (!clean) return
                  setScanTarget('item')
                  setScanItem(clean)
                  const line = selectedList.items?.find((x: PickItem) => x.id === scanLineId)
                    || selectedList.items?.find((x: PickItem) => x.item_code.toUpperCase() === clean.toUpperCase() && x.status !== 'picked')
                  if (line) {
                    setScanLineId(line.id)
                    setScanBin(line.location_code || line.bin_location || scanBin)
                    setScanQty(String(Math.max(1, (line.allocated_qty || line.qty) - line.picked_qty)))
                  }
                }}
              />
            </div>

            <div className="scan-bottom-bar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div className="scan-input-chip">
                <CheckSquare size={16} strokeWidth={1.8} />
                <input
                  value={scanItem}
                  onChange={e => setScanItem(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void logScan() } }}
                  placeholder="Item code…"
                  autoComplete="off"
                />
                <button type="button" className="scan-icon-btn" style={{ width: 36, height: 36 }} onClick={() => { setScanTarget('item'); setShowScanner(true) }} aria-label="Scan item">
                  <ScanLine size={16} />
                </button>
              </div>
              <div className="scan-input-chip">
                <MapPin size={16} strokeWidth={1.8} />
                <input
                  value={scanBin}
                  onChange={e => setScanBin(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void logScan() } }}
                  placeholder="Bin / location…"
                  autoComplete="off"
                />
                <button type="button" className="scan-icon-btn" style={{ width: 36, height: 36 }} onClick={() => { setScanTarget('bin'); setShowScanner(true) }} aria-label="Scan bin">
                  <ScanLine size={16} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="scan-count-input"
                  style={{ width: 88 }}
                  type="number"
                  value={scanQty}
                  onChange={e => setScanQty(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void logScan() } }}
                />
                <button type="button" className="scan-btn scan-btn-primary" style={{ flex: 1 }} onClick={() => void logScan()}>
                  Log pick
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(selectedList.items || []).map((pi: PickItem) => {
                const done = pi.status === 'picked' || pi.status === 'delivered'
                return (
                  <button
                    key={pi.id}
                    type="button"
                    className={`scan-row${scanLineId === pi.id ? ' selected' : ''}${done ? '' : ''}`}
                    onClick={() => { if (!done && pi.status !== 'shortage') selectLine(pi) }}
                    disabled={done || pi.status === 'shortage'}
                    style={{ width: '100%', textAlign: 'left' }}
                  >
                    <div className={`scan-row-check${done ? ' done' : ''}`}>{done ? '✓' : ''}</div>
                    <div className="scan-row-info">
                      <div className="scan-row-code">{pi.item_code}</div>
                      <div className="scan-row-desc">
                        {pi.location_code || pi.bin_location || '—'} · {pi.batch_no || 'no batch'}
                      </div>
                    </div>
                    <div className="scan-row-meta">
                      <div className="scan-row-qty">{pi.picked_qty}/{pi.allocated_qty ?? pi.qty}</div>
                      <div className="scan-row-label">{pi.status}</div>
                    </div>
                  </button>
                )
              })}
            </div>

            <Link to={`/pack?pick_list_id=${selectedList.id}`} className="scan-btn scan-btn-primary" style={{ textAlign: 'center', textDecoration: 'none' }}>
              Go to pack
            </Link>
              </>
            )}
          </>
        )}
      </ScannerLayout>
    )
  }

  return (
    <div className="desk-page space-y-3">
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      <PageHead
        eyebrow="Stock"
        title="Picking"
        subtitle="Wave and FEFO-allocated picks · Scan opens RF floor picking"
        actions={
          <>
            <Button variant="outline" onClick={() => enterRfPick(selectedList?.id)}>
              <ScanLine size={14} /> Scan
            </Button>
            <Link to="/wave" className="erpnext-btn-secondary inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md border">
              Wave desk
            </Link>
            <Button variant="outline" onClick={() => { setShowWave(!showWave); setShowNew(false); clearSelectedList() }}>
              {showWave ? 'Cancel Wave' : 'Quick Wave'}
            </Button>
            <Button onClick={() => { setShowNew(!showNew); setShowWave(false); clearSelectedList() }}>
              <Plus size={14} /> {showNew ? 'Cancel' : 'New Pick List'}
            </Button>
          </>
        }
      />

      {showWave && (
        <div className="erpnext-card p-4 space-y-3">
          <h3 className="font-semibold">Create Wave (multi-SO FEFO)</h3>
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            Confirmed SOs: {confirmedSOs.slice(0, 8).map((s: any) => `${s.id}:${s.name}`).join(', ') || 'none'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="erpnext-label">Sales Order IDs (comma-separated)</label>
              <input className="erpnext-input" value={waveSOIds} onChange={e => setWaveSOIds(e.target.value)} placeholder="12,15,18" />
            </div>
            <div>
              <label className="erpnext-label">Warehouse</label>
              <select className="erpnext-input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                <option value="">Default</option>
                {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.code || w.name}</option>)}
              </select>
            </div>
          </div>
          <button className="erpnext-btn-primary" onClick={createWave}>Allocate Wave</button>
        </div>
      )}

      {showNew && (
        <div className="erpnext-card">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold">Create Pick List</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
              Stock is allocated FEFO from storage / pick-face locations and reserved until pack or dispatch load.
            </p>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="erpnext-label">Sales Order No</label>
                <input className="erpnext-input" value={salesOrder} onChange={e => setSalesOrder(e.target.value)} placeholder="SO-001" />
              </div>
              <div>
                <label className="erpnext-label">Customer</label>
                <input className="erpnext-input" value={customer} onChange={e => setCustomer(e.target.value)} />
              </div>
              <div>
                <label className="erpnext-label">Warehouse</label>
                <select className="erpnext-input" value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                  <option value="">Default warehouse</option>
                  {warehouses.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.code || w.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm">Items to Pick</h4>
                <button onClick={addItem} className="erpnext-btn-secondary text-sm">+ Add Item</button>
              </div>
              <p className="text-xs mb-2" style={{ color: 'var(--text-dim)' }}>Type to search — new row auto-adds when last row has an item.</p>
              <div className="table-wrap">
                <table className="erpnext-table text-sm">
                  <thead>
                    <tr><th>#</th><th>Item Code</th><th>Qty</th><th></th></tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ color: 'var(--text-dim)' }}>{idx + 1}</td>
                        <td>
                          <ItemAutocomplete
                            value={item.item_code}
                            onSelect={(found) => {
                              const u = [...items]
                              u[idx] = { ...u[idx], item_code: found.code }
                              setPickLines(u)
                            }}
                            onChangeText={(t) => {
                              const packed = parsePackedItemQR(t)
                              if (packed) applyPickPackedQR(idx, packed)
                              else updateItem(idx, 'item_code', t)
                            }}
                          />
                        </td>
                        <td><input className="erpnext-input text-sm w-full" type="number" value={item.qty} onChange={e => updateItem(idx, 'qty', +e.target.value)} /></td>
                        <td><button onClick={() => removeItem(idx)} style={{ color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowNew(false); resetForm() }} className="erpnext-btn-secondary">Cancel</button>
              <button onClick={createList} className="erpnext-btn-primary">Allocate &amp; Create</button>
            </div>
          </div>
        </div>
      )}

      {msg && (
        <div style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', color: 'var(--green)', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
          {msg}
        </div>
      )}

      {!selectedList ? (
        <div className="erpnext-card">
          <div className="px-4 py-3 space-y-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold">Pick Lists</h3>
            <ListPager pager={pager} placeholder="Search pick lists…" />
          </div>
          <div className="p-4 table-wrap">
            <table className="erpnext-table">
              <thead>
                <tr><th>Name</th><th>Sales Order</th><th>Customer</th><th>Status</th><th>Mode</th><th>Picked</th><th>Action</th></tr>
              </thead>
              <tbody>
                {pager.pageItems.map(l => (
                  <tr key={l.id}>
                    <td className="font-medium cursor-pointer hover:underline" style={{ color: 'var(--accent)' }} onClick={() => openListDesk(l.id)}>{l.name}</td>
                    <td>{l.sales_order_no || '—'}</td>
                    <td>{l.customer || '—'}</td>
                    <td>{statusBadge(l.status || 'pending')}</td>
                    <td>{l.picking_mode || '—'}</td>
                    <td>{l.picked_qty} / {l.total_qty}</td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        <button onClick={() => openListDesk(l.id)} className="erpnext-btn-secondary text-xs">Open</button>
                        <button onClick={() => enterRfPick(l.id)} className="erpnext-btn-primary text-xs">
                          <ScanLine size={12} /> Scan
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pager.total === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>
                      <p style={{ marginBottom: 8 }}>No pick lists yet</p>
                      <p style={{ fontSize: 12, marginBottom: 12 }}>
                        Confirm a sales order, then use <strong>Create Pick</strong> (or Confirm &amp; Create Pick). Stock must be allocatable via FEFO.
                      </p>
                      <Link to="/sales-orders" className="erpnext-btn-primary text-xs" style={{ textDecoration: 'none' }}>
                        Sales Orders
                      </Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="erpnext-card">
          <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h3 className="font-semibold">{selectedList.name}</h3>
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                {selectedList.sales_order_no} — {selectedList.customer || 'No customer'}
                {selectedList.stock_consumed ? ' · stock consumed' : ' · reserved until pack/dispatch'}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => enterRfPick(selectedList.id)}>
                <ScanLine size={14} /> Start RF Scan
              </Button>
              <Link to={`/pack?pick_list_id=${selectedList.id}`} className="erpnext-btn-primary">Go to Pack</Link>
              <button
                className="erpnext-btn-secondary"
                onClick={async () => {
                  const r = await api.pickPrint(selectedList.id)
                  if (r.ok && r.data?.html) {
                    const w = window.open('', '_blank')
                    if (w) { w.document.write(r.data.html); w.document.close(); w.print() }
                  } else notify({ type: 'error', title: 'Print failed', message: r.error || '' })
                }}
              >Print</button>
              <button
                className="erpnext-btn-secondary"
                onClick={async () => {
                  const r = await api.backorderAutoFromPick(selectedList.id)
                  if (r.ok) notify({ type: 'success', title: 'Backorder', message: r.data.created ? r.data.backorder_no : r.data.message })
                  else notify({ type: 'error', title: 'Backorder failed', message: r.error || '' })
                }}
              >BO from shortage</button>
              {selectedList.status !== 'cancelled' && selectedList.status !== 'completed' && (
                <button
                  className="erpnext-btn-secondary"
                  style={{ color: 'var(--red)' }}
                  onClick={async () => {
                    if (!confirm('Cancel pick list and release reserved stock?')) return
                    const r = await api.pickCancel(selectedList.id)
                    if (r.ok) {
                      notify({ type: 'warning', title: 'Cancelled', message: 'Reservations released' })
                      clearSelectedList(); loadLists()
                    } else notify({ type: 'error', title: 'Cancel failed', message: r.error || '' })
                  }}
                >Cancel & Release</button>
              )}
              <button onClick={clearSelectedList} className="erpnext-btn-secondary">Back</button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Primary: RF floor pick — matches Receiving/Putaway scanner quality */}
            <div
              className="rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              style={{ background: 'var(--muted, #f4f4f5)', border: '1px solid var(--border)' }}
            >
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-sm mb-1">Floor picking</h4>
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  Camera + item/bin scan for this list. Same RF flow as receiving.
                </p>
              </div>
              <Button onClick={() => enterRfPick(selectedList.id)} className="shrink-0">
                <ScanLine size={14} /> Start RF Scan
              </Button>
            </div>

            {selectedList.items && selectedList.items.length > 0 && (
              <div>
                <h4 className="font-medium text-sm mb-2">Pick Items (FEFO)</h4>
                <div className="table-wrap">
                  <table className="erpnext-table text-sm">
                    <thead>
                      <tr><th>Item</th><th>Name</th><th>Alloc</th><th>Picked</th><th>Location</th><th>Batch</th><th>Status</th><th></th></tr>
                    </thead>
                    <tbody>
                      {selectedList.items.map((pi: PickItem) => (
                        <tr key={pi.id} className={scanLineId === pi.id ? 'bg-black/5' : undefined}>
                          <td className="font-medium">{pi.item_code}{fefoBadge(pi.fefo_badge)}</td>
                          <td>{pi.item_name}</td>
                          <td>{pi.allocated_qty ?? pi.qty}</td>
                          <td>{pi.picked_qty}</td>
                          <td>{pi.location_code || pi.bin_location || '—'}</td>
                          <td>
                            {pi.batch_no || '—'}
                            {pi.expiry_date ? <span className="block text-xs" style={{ color: 'var(--text-dim)' }}>{String(pi.expiry_date).slice(0, 10)}</span> : null}
                          </td>
                          <td>{statusBadge(pi.status)}</td>
                          <td>
                            {pi.status !== 'picked' && pi.status !== 'shortage' && pi.status !== 'delivered' && (
                              <button
                                onClick={() => { selectLine(pi); enterRfPick(selectedList.id) }}
                                className="erpnext-btn-secondary text-xs"
                              >
                                Pick
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Secondary: collapsed desk form for exceptions only */}
            <details className="rounded-lg" style={{ border: '1px solid var(--border)' }}>
              <summary
                className="cursor-pointer px-4 py-3 text-sm font-medium select-none"
                style={{ color: 'var(--text-dim)' }}
              >
                Manual / exception pick
              </summary>
              <div className="px-4 pb-4 pt-1">
                <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>
                  Type item, bin, and qty without the camera. Prefer <strong>Start RF Scan</strong> for floor work.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div>
                    <label className="erpnext-label">Item Code</label>
                    <div className="flex gap-1">
                      <input
                        className="erpnext-input"
                        value={scanItem}
                        onChange={e => setScanItem(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); logScan() } }}
                        placeholder="ITEM-001"
                      />
                      <button
                        type="button"
                        onClick={() => enterRfPick(selectedList.id)}
                        title="Open RF scanner"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--muted-foreground)' }}
                      >
                        <ScanLine size={18} strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="erpnext-label">Suggested / Scanned Bin</label>
                    <div className="flex gap-1">
                      <input
                        className="erpnext-input"
                        value={scanBin}
                        onChange={e => setScanBin(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); logScan() } }}
                        placeholder="A-01-01"
                      />
                      <button
                        type="button"
                        onClick={() => enterRfPick(selectedList.id)}
                        title="Open RF scanner"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--muted-foreground)' }}
                      >
                        <ScanLine size={18} strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="erpnext-label">Quantity</label>
                    <input
                      className="erpnext-input"
                      type="number"
                      value={scanQty}
                      onChange={e => setScanQty(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); logScan() } }}
                    />
                  </div>
                  <div className="flex items-end">
                    <button onClick={logScan} className="erpnext-btn-secondary">Log Pick</button>
                  </div>
                </div>
              </div>
            </details>
          </div>

          <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
            <Comments entityType="pick_list" entityId={selectedList.id} />
          </div>
        </div>
      )}
    </div>
  )
}
