import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'

export default function Returns() {
  const [list, setList] = useState<any[]>([])
  const [showNew, setShowNew] = useState(false)
  const [reason, setReason] = useState('')
  const [invoice, setInvoice] = useState('')
  const [dnNo, setDnNo] = useState('')
  const [itemCode, setItemCode] = useState('')
  const [qty, setQty] = useState('1')
  const [selected, setSelected] = useState<any>(null)
  const [locId, setLocId] = useState('')
  const [restockItem, setRestockItem] = useState('')
  const [restockQty, setRestockQty] = useState('1')

  const load = () => api.returnsList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => { load() }, [])

  const create = async () => {
    const r = await api.returnsCreate({
      reason,
      sales_invoice_no: invoice || undefined,
      delivery_note_no: dnNo || undefined,
      items: itemCode ? [{ item_code: itemCode, qty: +qty || 1, condition: 'damaged' }] : [],
    })
    if (r.ok) {
      notify({ type: 'success', title: 'Return claim', message: r.data.claim_no })
      setShowNew(false); setReason(''); setInvoice(''); setDnNo(''); setItemCode('')
      load()
    } else notify({ type: 'error', title: 'Failed', message: r.error || '' })
  }

  const receive = async (id: number) => {
    const r = await api.returnsReceive(id, {})
    if (r.ok) {
      notify({ type: 'success', title: 'Received', message: 'At dock' })
      load()
      if (selected?.id === id) setSelected({ ...selected, status: 'received' })
    } else notify({ type: 'error', title: 'Receive failed', message: r.error || '' })
  }

  const inspect = async (id: number, result: string) => {
    const r = await api.returnsInspect(id, { result })
    if (r.ok) {
      notify({ type: 'success', title: 'Inspected', message: result })
      load()
      if (selected?.id === id) setSelected({ ...selected, status: r.data.status })
    }
  }

  const decide = async (decision: 'restock' | 'scrap' | 'rts') => {
    if (!selected) return
    if ((decision === 'restock' || decision === 'scrap') && (!restockItem || !restockQty)) {
      notify({ type: 'error', title: 'Item + qty required', message: '' })
      return
    }
    if (decision === 'restock' && !locId) {
      notify({ type: 'error', title: 'Location required for restock', message: '' })
      return
    }
    const r = await api.returnsDecide(selected.id, {
      decision,
      item_code: restockItem || undefined,
      qty: +restockQty || undefined,
      location_id: locId ? +locId : undefined,
    })
    if (r.ok) {
      notify({ type: 'success', title: 'Decision', message: decision })
      load(); setSelected(null)
    } else notify({ type: 'error', title: 'Decide failed', message: r.error || '' })
  }

  const restock = async () => {
    if (!selected || !locId || !restockItem) return
    const r = await api.returnsRestock(selected.id, {
      item_code: restockItem,
      qty: +restockQty || 1,
      location_id: +locId,
      condition: 'damaged',
    })
    if (r.ok) {
      notify({ type: 'success', title: 'Restocked', message: 'Only hold/damaged locations allowed' })
      load(); setSelected(null)
    } else notify({ type: 'error', title: 'Restock blocked', message: r.error || '' })
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div>
          <h2 className="text-lg font-semibold">Returns</h2>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Receive → Inspect → Decide (restock / scrap / RTS)</p>
        </div>
        <button className="erpnext-btn-primary" onClick={() => setShowNew(!showNew)}>{showNew ? 'Cancel' : '+ Claim'}</button>
      </div>

      {showNew && (
        <div className="erpnext-card p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2"><label className="erpnext-label">Reason *</label><input className="erpnext-input" value={reason} onChange={e => setReason(e.target.value)} /></div>
            <div><label className="erpnext-label">Sales Invoice</label><input className="erpnext-input" value={invoice} onChange={e => setInvoice(e.target.value)} /></div>
            <div><label className="erpnext-label">Delivery Note</label><input className="erpnext-input" value={dnNo} onChange={e => setDnNo(e.target.value)} /></div>
            <div><label className="erpnext-label">Item</label><input className="erpnext-input" value={itemCode} onChange={e => setItemCode(e.target.value)} /></div>
            <div><label className="erpnext-label">Qty</label><input className="erpnext-input" type="number" value={qty} onChange={e => setQty(e.target.value)} /></div>
          </div>
          <button className="erpnext-btn-primary" onClick={create}>Create Claim</button>
        </div>
      )}

      {!selected ? (
        <div className="erpnext-card">
          <table className="erpnext-table">
            <thead><tr><th>Claim</th><th>Invoice</th><th>Reason</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {list.map((r: any) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.claim_no}</td>
                  <td>{r.sales_invoice_no || '—'}</td>
                  <td>{r.reason || '—'}</td>
                  <td>{r.status}</td>
                  <td className="flex gap-1 flex-wrap">
                    <button className="erpnext-btn-secondary text-xs" onClick={() => setSelected(r)}>Open</button>
                    {r.status === 'pending' && (
                      <button className="erpnext-btn-primary text-xs" onClick={() => receive(r.id)}>Receive</button>
                    )}
                    {(r.status === 'pending' || r.status === 'received') && (
                      <>
                        <button className="erpnext-btn-primary text-xs" onClick={() => inspect(r.id, 'accepted')}>Accept</button>
                        <button className="erpnext-btn-secondary text-xs" onClick={() => inspect(r.id, 'rejected')}>Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={5} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No returns</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="erpnext-card p-4 space-y-3">
          <div className="flex justify-between">
            <h3 className="font-semibold">{selected.claim_no} · {selected.status}</h3>
            <button className="erpnext-btn-secondary" onClick={() => setSelected(null)}>Back</button>
          </div>
          <p className="text-sm">{selected.reason}</p>
          {selected.status === 'pending' && (
            <button className="erpnext-btn-primary" onClick={() => receive(selected.id)}>Mark Received</button>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className="erpnext-label">Item</label><input className="erpnext-input" value={restockItem} onChange={e => setRestockItem(e.target.value)} /></div>
            <div><label className="erpnext-label">Qty</label><input className="erpnext-input" type="number" value={restockQty} onChange={e => setRestockQty(e.target.value)} /></div>
            <div><label className="erpnext-label">Hold/Damaged Location ID</label><input className="erpnext-input" value={locId} onChange={e => setLocId(e.target.value)} /></div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className="erpnext-btn-primary" onClick={() => decide('restock')}>Decide: Restock</button>
            <button className="erpnext-btn-secondary" onClick={() => decide('scrap')}>Decide: Scrap</button>
            <button className="erpnext-btn-secondary" onClick={() => decide('rts')}>Decide: RTS</button>
            <button className="erpnext-btn-secondary" onClick={restock}>Legacy Restock</button>
          </div>
        </div>
      )}
    </div>
  )
}
