import { useEffect, useState } from 'react'
import { api } from '../services/api'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'

interface Se {
  id: number
  name: string
  stock_entry_type: string | null
  status: string | null
  posting_date: string | null
  to_warehouse: string | null
}

export default function StockEntries() {
  const [list, setList] = useState<Se[]>([])

  const loadList = () => api.stockEntryList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => { loadList() }, [])
  const pager = useClientPager(list)

  const statusBadge = (status: string) => {
    const cls = status === 'completed' ? 'erpnext-badge-green' :
                status === 'in_progress' ? 'erpnext-badge-blue' :
                'erpnext-badge-yellow'
    return <span className={`erpnext-badge ${cls}`}>{status}</span>
  }

  return (
    <div className="desk-page space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Stock Entries</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>Stock movement entries between warehouses</p>
        </div>
      </div>

      <div className="erpnext-card">
        <div className="px-6 py-4 border-b space-y-3" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold">All Stock Entries ({list.length})</h2>
          <ListPager pager={pager} placeholder="Search stock entries…" />
        </div>
        <div className="p-4">
          <table className="erpnext-table">
            <thead>
              <tr style={{ background: 'var(--panel-2)' }}>
                <th>Name</th>
                <th>Type</th>
                <th>To Warehouse</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {pager.pageItems.map(s => (
                <tr key={s.id}>
                  <td className="font-medium" style={{ color: 'var(--accent)' }}>{s.name}</td>
                  <td>{s.stock_entry_type || '—'}</td>
                  <td>{s.to_warehouse || '—'}</td>
                  <td>{statusBadge(s.status || 'draft')}</td>
                  <td>{s.posting_date ? new Date(s.posting_date).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
              {pager.total === 0 && <tr><td colSpan={5} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No stock entries</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
