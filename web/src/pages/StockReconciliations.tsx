import { useEffect, useState } from 'react'
import { api } from '../services/api'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'

interface Sr {
  id: number
  name: string
  status: string | null
  posting_date: string | null
}

export default function StockReconciliations() {
  const [list, setList] = useState<Sr[]>([])

  const loadList = () => api.stockReconList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => { loadList() }, [])
  const pager = useClientPager(list)

  const statusBadge = (status: string) => {
    const cls = status === 'completed' ? 'erpnext-badge-green' :
                status === 'in_progress' ? 'erpnext-badge-blue' :
                'erpnext-badge-yellow'
    return <span className={`erpnext-badge ${cls}`}>{status}</span>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Stock Reconciliations</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>Reconcile inventory differences and adjustments</p>
        </div>
      </div>

      <div className="erpnext-card">
        <div className="px-6 py-4 border-b space-y-3" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold">All Reconciliations ({list.length})</h2>
          <ListPager pager={pager} placeholder="Search reconciliations…" />
        </div>
        <div className="p-4">
          <table className="erpnext-table">
            <thead>
              <tr style={{ background: 'var(--panel-2)' }}>
                <th>Name</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {pager.pageItems.map(s => (
                <tr key={s.id}>
                  <td className="font-medium" style={{ color: 'var(--accent)' }}>{s.name}</td>
                  <td>{statusBadge(s.status || 'draft')}</td>
                  <td>{s.posting_date ? new Date(s.posting_date).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
              {pager.total === 0 && <tr><td colSpan={3} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No reconciliations</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
