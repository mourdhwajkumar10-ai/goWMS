import { useEffect, useState } from 'react'
import { api } from '../services/api'
import BarcodeScanner from '../components/BarcodeScanner'
import Comments from '../components/Comments'
import { notify } from '../components/Notifications'

interface QiInspection {
  id: number
  inspection_no: string
  reference_type: string | null
  reference_name: string | null
  item_code: string
  item_name: string
  sample_size: number | null
  status: string | null
  created_at: string
}

export default function Qi() {
  const [list, setList] = useState<QiInspection[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [msg, setMsg] = useState('')

  const [itemCode, setItemCode] = useState('')
  const [referenceType, setReferenceType] = useState('Purchase Receipt')
  const [referenceName, setReferenceName] = useState('')
  const [sampleSize, setSampleSize] = useState('10')

  const [rejectReason, setRejectReason] = useState('')

  const loadList = () => api.qiList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => { loadList() }, [])

  const createInspection = async () => {
    const r = await api.qiCreate({
      item_code: itemCode,
      reference_type: referenceType,
      reference_name: referenceName,
      sample_size: +sampleSize || 10,
    })
    if (r.ok) {
      setMsg(`Inspection ${r.data.inspection_no} created`)
      setItemCode(''); setReferenceName('')
      loadList()
      notify({ type: 'success', title: 'Inspection Created', message: r.data.inspection_no })
    }
  }

  const openInspection = async (id: number) => {
    const r = await api.get(`/qi/${id}`)
    if (r.ok) setSelected(r.data)
  }

  const handleScan = (code: string) => {
    setShowScanner(false)
    setItemCode(code)
  }

  const acceptInspection = async () => {
    if (!selected) return
    const r = await api.post(`/qi/${selected.id}/submit`, { status: 'accepted' })
    if (r.ok) {
      notify({ type: 'success', title: 'Accepted', message: `${selected.item_code} passed inspection` })
      setSelected(null)
      loadList()
    }
  }

  const rejectInspection = async () => {
    if (!selected) return
    const r = await api.post(`/qi/${selected.id}/submit`, { status: 'rejected', reason: rejectReason })
    if (r.ok) {
      notify({ type: 'warning', title: 'Rejected', message: `${selected.item_code} failed inspection` })
      setSelected(null)
      setRejectReason('')
      loadList()
    }
  }

  const statusBadge = (status: string) => {
    const cls = status === 'accepted' ? 'erpnext-badge-green' :
                status === 'rejected' ? 'erpnext-badge-red' :
                'erpnext-badge-yellow'
    return <span className={`erpnext-badge ${cls}`}>{status}</span>
  }

  return (
    <div className="space-y-6">
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Quality Inspection</h2>
        <button onClick={() => setShowScanner(true)} className="erpnext-btn-secondary">📷 Scan Item</button>
      </div>

      {!selected ? (
        <>
          <div className="erpnext-card">
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-semibold">Create Inspection</h3>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                  <label className="erpnext-label">Item Code *</label>
                  <div className="flex gap-1">
                    <input className="erpnext-input" value={itemCode} onChange={e => setItemCode(e.target.value)} placeholder="ITEM-001" />
                    <button onClick={() => setShowScanner(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>📷</button>
                  </div>
                </div>
                <div>
                  <label className="erpnext-label">Reference Type</label>
                  <select className="erpnext-input" value={referenceType} onChange={e => setReferenceType(e.target.value)}>
                    <option>Purchase Receipt</option>
                    <option>Purchase Order</option>
                    <option>Stock Entry</option>
                  </select>
                </div>
                <div>
                  <label className="erpnext-label">Reference Name</label>
                  <input className="erpnext-input" value={referenceName} onChange={e => setReferenceName(e.target.value)} placeholder="PR-001" />
                </div>
                <div>
                  <label className="erpnext-label">Sample Size</label>
                  <input className="erpnext-input" type="number" value={sampleSize} onChange={e => setSampleSize(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <button onClick={createInspection} className="erpnext-btn-primary">Create</button>
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
              <h3 className="font-semibold">Inspections</h3>
            </div>
            <table className="erpnext-table">
              <thead>
                <tr><th>Inspection No</th><th>Item</th><th>Reference</th><th>Sample</th><th>Status</th><th>Created</th><th>Action</th></tr>
              </thead>
              <tbody>
                {list.map(q => (
                  <tr key={q.id}>
                    <td className="font-medium cursor-pointer hover:underline" style={{ color: 'var(--accent)' }} onClick={() => openInspection(q.id)}>{q.inspection_no}</td>
                    <td>{q.item_code}</td>
                    <td>{q.reference_name || '—'}</td>
                    <td>{q.sample_size ?? '—'}</td>
                    <td>{statusBadge(q.status || 'pending')}</td>
                    <td>{new Date(q.created_at).toLocaleDateString()}</td>
                    <td>
                      <button onClick={() => openInspection(q.id)} className="erpnext-btn-secondary text-xs">Open</button>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && <tr><td colSpan={7} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No inspections</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="erpnext-card">
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h3 className="font-semibold">{selected.inspection_no}</h3>
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                {selected.item_code} — {selected.item_name || ''} | Reference: {selected.reference_name || '—'}
              </p>
            </div>
            <button onClick={() => setSelected(null)} className="erpnext-btn-secondary">Back</button>
          </div>

          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
              <div><span style={{ color: 'var(--text-dim)' }}>Item: </span><strong>{selected.item_code}</strong></div>
              <div><span style={{ color: 'var(--text-dim)' }}>Sample Size: </span>{selected.sample_size}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>Status: </span>{statusBadge(selected.status || 'pending')}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>Created: </span>{new Date(selected.created_at).toLocaleString()}</div>
            </div>

            {selected.status === 'pending' && (
              <div className="mt-4">
                <h4 className="font-medium text-sm mb-2">Inspection Result</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="flex gap-2">
                    <button onClick={acceptInspection} className="erpnext-btn-primary" style={{ background: 'var(--green)' }}>✓ Accept</button>
                    <button onClick={() => {}} className="erpnext-btn-primary" style={{ background: 'var(--red)' }}>✕ Reject</button>
                  </div>
                  <div className="md:col-span-2">
                    <label className="erpnext-label">Reject Reason (if rejecting)</label>
                    <input className="erpnext-input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection..." />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
            <Comments entityType="quality_inspection" entityId={selected.id} />
          </div>
        </div>
      )}
    </div>
  )
}
