import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import BarcodeScanner from '../components/BarcodeScanner'
import Comments from '../components/Comments'
import { notify } from '../components/Notifications'

interface Box {
  id: number
  label: string
  pick_list_id: number | null
  delivery_note: string | null
  loaded: boolean
  created_at: string
  total_items?: number
}

interface BoxItem {
  id: number
  item_code: string
  quantity: number
  batch_no: string | null
}

export default function Pack() {
  const [searchParams] = useSearchParams()
  const [boxes, setBoxes] = useState<Box[]>([])
  const [selectedBox, setSelectedBox] = useState<any>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [msg, setMsg] = useState('')

  const [label, setLabel] = useState('')
  const [pickListId, setPickListId] = useState(searchParams.get('pick_list_id') || '')
  const [deliveryNote, setDeliveryNote] = useState('')

  const [packItem, setPackItem] = useState('')
  const [packQty, setPackQty] = useState('1')
  const [packBatch, setPackBatch] = useState('')

  const loadBoxes = () => api.packSessions().then(r => { if (r.ok) setBoxes(r.data ?? []) })
  useEffect(() => { loadBoxes() }, [])
  useEffect(() => {
    const fromUrl = searchParams.get('pick_list_id')
    if (fromUrl) setPickListId(fromUrl)
  }, [searchParams])

  const createBox = async () => {
    const r = await api.packCreate({
      label,
      pick_list_id: pickListId ? +pickListId : undefined,
      delivery_note: deliveryNote || undefined,
    })
    if (r.ok) {
      setMsg(`Box ${r.data.label} created`)
      setLabel(''); setPickListId(''); setDeliveryNote('')
      loadBoxes()
      notify({ type: 'success', title: 'Box Created', message: r.data.label })
    }
  }

  const openBox = async (id: number) => {
    const r = await api.get(`/packing/${id}`)
    if (r.ok) setSelectedBox(r.data)
  }

  const handleScan = (code: string) => {
    setShowScanner(false)
    setPackItem(code)
  }

  const packIntoBox = async () => {
    if (!packItem || !selectedBox) return
    try {
      const r = await api.post(`/packing/${selectedBox.id}/item`, {
        item_code: packItem,
        quantity: +packQty || 1,
        batch_no: packBatch || undefined,
      })
      if (r.ok) {
        if ((r.data as any)?.warning) {
          notify({ type: 'warning', title: 'Packed (weight warning)', message: (r.data as any).warning })
        } else {
          notify({ type: 'success', title: 'Item Packed', message: `${packItem}: ${packQty} units` })
        }
        setPackItem(''); setPackQty('1'); setPackBatch('')
        openBox(selectedBox.id)
      } else if (!navigator.onLine) {
        const { enqueueScan } = await import('../utils/offlineQueue')
        enqueueScan(`/packing/${selectedBox.id}/item`, {
          item_code: packItem, quantity: +packQty || 1, batch_no: packBatch || undefined,
        })
        notify({ type: 'warning', title: 'Offline queued', message: 'Will sync when online' })
      } else {
        notify({ type: 'error', title: 'Pack failed', message: r.error || '' })
      }
    } catch {
      const { enqueueScan } = await import('../utils/offlineQueue')
      enqueueScan(`/packing/${selectedBox.id}/item`, {
        item_code: packItem, quantity: +packQty || 1, batch_no: packBatch || undefined,
      })
      notify({ type: 'warning', title: 'Queued offline', message: 'Network error — saved locally' })
    }
  }

  const markLoaded = async (id: number) => {
    const r = await api.post<{ stock_consumed?: boolean }>(`/packing/${id}/load`, {})
    if (r.ok) {
      notify({
        type: 'success',
        title: 'Box Loaded',
        message: r.data?.stock_consumed ? 'Loaded — reserved location stock consumed' : 'Marked as loaded',
      })
      loadBoxes()
    } else {
      notify({ type: 'error', title: 'Load failed', message: r.error || 'Could not load box' })
    }
  }

  return (
    <div className="space-y-6">
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Packing</h2>
        <button onClick={() => setShowScanner(true)} className="erpnext-btn-secondary">📷 Scan Item</button>
      </div>

      {!selectedBox ? (
        <>
          <div className="erpnext-card">
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-semibold">Create Box</h3>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="erpnext-label">Box Label *</label>
                  <input className="erpnext-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="BOX-001" />
                </div>
                <div>
                  <label className="erpnext-label">Pick List ID</label>
                  <input className="erpnext-input" type="number" value={pickListId} onChange={e => setPickListId(e.target.value)} />
                </div>
                <div>
                  <label className="erpnext-label">Delivery Note</label>
                  <input className="erpnext-input" value={deliveryNote} onChange={e => setDeliveryNote(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <button onClick={createBox} className="erpnext-btn-primary">Create Box</button>
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
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-semibold">Boxes</h3>
            </div>
            <table className="erpnext-table">
              <thead>
                <tr><th>ID</th><th>Label</th><th>Pick List</th><th>Delivery Note</th><th>Items</th><th>Loaded</th><th>Created</th><th>Action</th></tr>
              </thead>
              <tbody>
                {boxes.map(b => (
                  <tr key={b.id}>
                    <td>{b.id}</td>
                    <td className="font-medium cursor-pointer hover:underline" style={{ color: 'var(--accent)' }} onClick={() => openBox(b.id)}>{b.label}</td>
                    <td>{b.pick_list_id || '—'}</td>
                    <td>{b.delivery_note || '—'}</td>
                    <td>{(b as any).total_items ?? 0}</td>
                    <td>
                      <span className={`erpnext-badge ${b.loaded ? 'erpnext-badge-green' : 'erpnext-badge-yellow'}`}>
                        {b.loaded ? 'loaded' : 'not loaded'}
                      </span>
                    </td>
                    <td>{new Date(b.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => openBox(b.id)} className="erpnext-btn-secondary text-xs">Open</button>
                        {!b.loaded && (
                          <button onClick={() => markLoaded(b.id)} className="erpnext-btn-primary text-xs">Mark Loaded</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {boxes.length === 0 && <tr><td colSpan={8} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No boxes</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="erpnext-card">
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h3 className="font-semibold">{selectedBox.label}</h3>
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                Pick List: {selectedBox.pick_list_id || '—'} | Delivery Note: {selectedBox.delivery_note || '—'}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="erpnext-btn-secondary"
                onClick={async () => {
                  const r = await api.packLabel(selectedBox.id)
                  if (r.ok && r.data?.html) {
                    const w = window.open('', '_blank')
                    if (w) { w.document.write(r.data.html); w.document.close(); w.print() }
                  } else notify({ type: 'error', title: 'Label failed', message: r.error || '' })
                }}
              >Print Label</button>
              <button onClick={() => setSelectedBox(null)} className="erpnext-btn-secondary">Back</button>
            </div>
          </div>

          <div className="p-4">
            <h4 className="font-medium text-sm mb-2">Pack Item</h4>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <label className="erpnext-label">Item Code</label>
                <div className="flex gap-1">
                  <input
                    className="erpnext-input"
                    value={packItem}
                    onChange={e => setPackItem(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); packIntoBox() } }}
                    placeholder="ITEM-001"
                  />
                  <button onClick={() => setShowScanner(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>📷</button>
                </div>
              </div>
              <div>
                <label className="erpnext-label">Quantity</label>
                <input
                  className="erpnext-input"
                  type="number"
                  value={packQty}
                  onChange={e => setPackQty(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); packIntoBox() } }}
                />
              </div>
              <div>
                <label className="erpnext-label">Batch No</label>
                <input
                  className="erpnext-input"
                  value={packBatch}
                  onChange={e => setPackBatch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); packIntoBox() } }}
                />
              </div>
              <div className="flex items-end">
                <button onClick={packIntoBox} className="erpnext-btn-primary">Pack</button>
              </div>
            </div>

            {selectedBox.items && selectedBox.items.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-sm mb-2">Packed Items ({selectedBox.items.length})</h4>
                <table className="erpnext-table text-sm">
                  <thead>
                    <tr><th>Item</th><th>Quantity</th><th>Batch</th></tr>
                  </thead>
                  <tbody>
                    {selectedBox.items.map((bi: BoxItem) => (
                      <tr key={bi.id}>
                        <td className="font-medium">{bi.item_code}</td>
                        <td>{bi.quantity}</td>
                        <td>{bi.batch_no || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
            <Comments entityType="box" entityId={selectedBox.id} />
          </div>
        </div>
      )}
    </div>
  )
}
