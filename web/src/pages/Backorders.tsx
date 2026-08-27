import { useEffect, useState } from 'react'
import { api, getToken } from '../services/api'
import { notify } from '../components/Notifications'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'
import ItemAutocomplete from '../components/ItemAutocomplete'

export default function Backorders() {
  const [tab, setTab] = useState<'v1' | 'v2'>('v2')
  const [list, setList] = useState<any[]>([])
  const [listV2, setListV2] = useState<any[]>([])
  const [so, setSo] = useState('')
  const [customer, setCustomer] = useState('')
  const [customerList, setCustomerList] = useState<any[]>([])
  const [showCustDrop, setShowCustDrop] = useState(false)
  const [notes, setNotes] = useState('')
  const [itemCode, setItemCode] = useState('')
  const [qty, setQty] = useState('1')

  const load = () => {
    api.backorderList().then(r => { if (r.ok) setList(r.data ?? []) })
    api.backorderV2List().then(r => { if (r.ok) setListV2(r.data ?? []) })
  }
  useEffect(() => { load(); api.customerList().then(r => { if (r.ok) setCustomerList(r.data ?? []) }) }, [])
  const pager = useClientPager(tab === 'v2' ? listV2 : list)

  const create = async () => {
    if (!so) return
    if (tab === 'v2') {
      const r = await api.backorderV2Create({
        sales_order_no: so, customer, notes,
        lines: itemCode ? [{ item_code: itemCode, qty: +qty || 1 }] : [],
      })
      if (r.ok) {
        notify({ type: 'success', title: 'Backorder v2', message: r.data.backorder_no })
        setSo(''); setCustomer(''); setNotes(''); setItemCode(''); load()
      } else notify({ type: 'error', title: 'Failed', message: r.error || '' })
    } else {
      const r = await api.backorderCreate({ sales_order_no: so, customer, notes })
      if (r.ok) {
        notify({ type: 'success', title: 'Backorder', message: r.data.backorder_no })
        setSo(''); setCustomer(''); setNotes(''); load()
      } else {
        notify({ type: 'error', title: 'Failed', message: r.error || 'UNIQUE(sales_order_no) — use v2 tab' })
      }
    }
  }

  return (
    <div className="desk-page space-y-3">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Backorders</h2>

        </div>
        <div className="flex gap-2">
          <button className={tab === 'v2' ? 'erpnext-btn-primary' : 'erpnext-btn-secondary'} onClick={() => setTab('v2')}>v2</button>
          <button className={tab === 'v1' ? 'erpnext-btn-primary' : 'erpnext-btn-secondary'} onClick={() => setTab('v1')}>v1</button>
        </div>
      </div>

      <div className="erpnext-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div><label className="erpnext-label">Sales Order *</label><input className="erpnext-input" value={so} onChange={e => setSo(e.target.value)} /></div>
          <div style={{ position: 'relative' }}><label className="erpnext-label">Customer</label><input className="erpnext-input" value={customer} onFocus={() => setShowCustDrop(true)} onChange={e => { setCustomer(e.target.value); setShowCustDrop(true) }} onBlur={() => setTimeout(() => setShowCustDrop(false), 200)} placeholder="Type to search..." onKeyDown={e => { if ((e.key === 'Enter' || e.key === 'Tab') && showCustDrop && customerList.length > 0) { const filtered = customerList.filter((c: any) => !customer || (c.name || '').toLowerCase().includes(customer.toLowerCase())).slice(0, 10); if (filtered.length > 0) { setCustomer(filtered[0].name); setShowCustDrop(false); if (e.key === 'Enter') e.preventDefault(); } } }} />{showCustDrop && customerList.length > 0 && (<div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--card-bg, #fff)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto' }}>{customerList.filter((c: any) => !customer || (c.name || '').toLowerCase().includes(customer.toLowerCase())).slice(0, 10).map((c: any) => (<div key={c.id} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13 }} onMouseDown={() => { setCustomer(c.name); setShowCustDrop(false) }}><div style={{ fontWeight: 600 }}>{c.name}</div></div>))}</div>)}</div>
          {tab === 'v2' && (
            <>
              <div><label className="erpnext-label">Item</label><ItemAutocomplete value={itemCode} onSelect={(found) => setItemCode(found.code)} onChangeText={(t) => setItemCode(t)} placeholder="Scan or type..." /></div>
              <div><label className="erpnext-label">Qty</label><input className="erpnext-input" type="number" value={qty} onChange={e => setQty(e.target.value)} /></div>
            </>
          )}
          <div><label className="erpnext-label">Notes</label><input className="erpnext-input" value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <div className="flex items-end"><button className="erpnext-btn-primary" onClick={create}>Create</button></div>
        </div>
      </div>

      <div className="erpnext-card">
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <ListPager pager={pager} placeholder="Search backorders…" />
        </div>
        <table className="erpnext-table">
          <thead>
            <tr><th>Backorder</th><th>SO</th><th>Customer</th><th>Status</th><th>Lines</th><th>Created</th><th></th></tr>
          </thead>
          <tbody>
            {pager.pageItems.map((b: any, i: number) => (
              <tr key={b.id || b.backorder_no || i}>
                <td className="font-medium">{b.backorder_no}</td>
                <td>{b.sales_order_no}</td>
                <td>{b.customer || '—'}</td>
                <td>{b.status}</td>
                <td>{b.line_count ?? '—'}</td>
                <td>{b.created_at}</td>
                <td>
                  {tab === 'v2' && b.id && b.status === 'pending' && (
                    <button className="erpnext-btn-secondary text-xs" onClick={async () => {
                      const r = await api.backorderV2Fulfill(b.id)
                      if (r.ok) { notify({ type: 'success', title: 'Fulfilled', message: b.backorder_no }); load() }
                    }}>Fulfill</button>
                  )}
                </td>
              </tr>
            ))}
            {pager.total === 0 && (
              <tr><td colSpan={7} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No open backorders</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {!getToken() && null}
    </div>
  )
}
