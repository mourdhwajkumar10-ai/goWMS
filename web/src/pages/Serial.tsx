import { useEffect, useState } from 'react'
import { api } from '../services/api'
import BarcodeScanner from '../components/BarcodeScanner'
import { notify } from '../components/Notifications'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'

interface SerialNo {
  id: number
  serial_no: string
  item_code: string
  item_name: string
  warehouse: string | null
  status: string | null
  batch_no: string | null
  created_at: string
}

export default function Serial() {
  const [list, setList] = useState<SerialNo[]>([])
  const [showScanner, setShowScanner] = useState(false)
  const [msg, setMsg] = useState('')

  const [serialNo, setSerialNo] = useState('')
  const [itemCode, setItemCode] = useState('')
  const [batchNo, setBatchNo] = useState('')
  const [warehouse, setWarehouse] = useState('Stores - GW')

  const [scanSerial, setScanSerial] = useState('')
  const [scanStatus, setScanStatus] = useState('available')

  const loadList = () => api.serialList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => { loadList() }, [])
  const pager = useClientPager(list)

  const createSerial = async () => {
    const r = await api.post('/serial/', {
      serial_no: serialNo,
      item_code: itemCode,
      batch_no: batchNo,
      warehouse,
    })
    if (r.ok) {
      setMsg(`Serial ${serialNo} created`)
      setSerialNo(''); setItemCode(''); setBatchNo('')
      loadList()
      notify({ type: 'success', title: 'Serial Created', message: serialNo })
    }
  }

  const handleScan = (code: string) => {
    setShowScanner(false)
    setScanSerial(code)
  }

  const updateStatus = async () => {
    if (!scanSerial) return
    const r = await api.post('/serial/scan', { serial_no: scanSerial, status: scanStatus })
    if (r.ok) {
      notify({ type: 'success', title: 'Status Updated', message: `${scanSerial} → ${scanStatus}` })
      setScanSerial('')
      loadList()
    }
  }

  const statusBadge = (status: string) => {
    const cls = status === 'available' ? 'erpnext-badge-green' :
                status === 'sold' ? 'erpnext-badge-blue' :
                status === 'returned' ? 'erpnext-badge-yellow' :
                'erpnext-badge-red'
    return <span className={`erpnext-badge ${cls}`}>{status}</span>
  }

  return (
    <div className="desk-page space-y-3">
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Serial Numbers</h2>
        <button onClick={() => setShowScanner(true)} className="erpnext-btn-secondary">📷 Scan Serial</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="erpnext-card">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold">Create Serial</h3>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="erpnext-label">Serial No *</label>
              <input className="erpnext-input" value={serialNo} onChange={e => setSerialNo(e.target.value)} placeholder="SN-001" />
            </div>
            <div>
              <label className="erpnext-label">Item Code *</label>
              <input className="erpnext-input" value={itemCode} onChange={e => setItemCode(e.target.value)} placeholder="ITEM-001" />
            </div>
            <div>
              <label className="erpnext-label">Batch No</label>
              <input className="erpnext-input" value={batchNo} onChange={e => setBatchNo(e.target.value)} />
            </div>
            <div>
              <label className="erpnext-label">Warehouse</label>
              <input className="erpnext-input" value={warehouse} onChange={e => setWarehouse(e.target.value)} />
            </div>
            <button onClick={createSerial} className="erpnext-btn-primary">Create</button>
          </div>
        </div>

        <div className="erpnext-card">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold">Update Status</h3>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="erpnext-label">Serial No *</label>
              <div className="flex gap-1">
                <input className="erpnext-input" value={scanSerial} onChange={e => setScanSerial(e.target.value)} placeholder="Scan or type..." />
                <button onClick={() => setShowScanner(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>📷</button>
              </div>
            </div>
            <div>
              <label className="erpnext-label">Status</label>
              <select className="erpnext-input" value={scanStatus} onChange={e => setScanStatus(e.target.value)}>
                <option value="available">Available</option>
                <option value="sold">Sold</option>
                <option value="returned">Returned</option>
                <option value="damaged">Damaged</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <button onClick={updateStatus} className="erpnext-btn-primary">Update Status</button>
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
          <h3 className="font-semibold">Serial Numbers ({list.length})</h3>
          <ListPager pager={pager} placeholder="Search serial…" />
        </div>
        <table className="erpnext-table">
          <thead>
            <tr><th>Serial No</th><th>Item</th><th>Batch</th><th>Warehouse</th><th>Status</th><th>Created</th></tr>
          </thead>
          <tbody>
            {pager.pageItems.map(s => (
              <tr key={s.id}>
                <td className="font-medium">{s.serial_no}</td>
                <td>{s.item_code}</td>
                <td>{s.batch_no || '—'}</td>
                <td>{s.warehouse || '—'}</td>
                <td>{statusBadge(s.status || 'available')}</td>
                <td>{new Date(s.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {pager.total === 0 && <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No serial numbers</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
