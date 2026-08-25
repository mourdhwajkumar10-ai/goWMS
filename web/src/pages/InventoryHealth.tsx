import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'

interface ReorderAlert {
  item_code: string
  item_name: string
  safety_stock: number
  reorder_level: number
  reorder_qty: number
  max_stock: number
  available_qty: number
  alert_type: string
  suggested_qty: number
}

interface ExpiryAlert {
  item_code: string
  item_name: string
  warehouse_code: string
  location_code: string
  batch_no: string
  expiry_date: string
  days_until_expiry: number
  available_qty: number
  severity: string
  fefo_priority: boolean
}

export default function InventoryHealth() {
  const [reorder, setReorder] = useState<ReorderAlert[]>([])
  const [expiry, setExpiry] = useState<ExpiryAlert[]>([])
  const [tab, setTab] = useState<'reorder' | 'expiry'>('reorder')
  const [days, setDays] = useState('90')

  const load = () => {
    api.get<ReorderAlert[]>('/inventory/reorder-alerts').then(r => { if (r.ok) setReorder(r.data ?? []) })
    api.get<ExpiryAlert[]>(`/inventory/expiry-alerts?days=${+days || 90}`).then(r => { if (r.ok) setExpiry(r.data ?? []) })
  }
  useEffect(() => { load() }, [days])
  const reorderPager = useClientPager(reorder)
  const expiryPager = useClientPager(expiry)

  const refresh = async () => {
    const r = await api.post<{ notifications_created: number }>('/inventory/refresh-alerts', {})
    if (r.ok) {
      notify({ type: 'success', title: 'Alerts refreshed', message: `${r.data.notifications_created} notifications created` })
      load()
    } else {
      notify({ type: 'error', title: 'Refresh failed', message: r.error || '' })
    }
  }

  return (
    <div className="desk-page space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Inventory Health</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
            Min/max reorder alerts and FEFO expiry warnings
          </p>
        </div>
        <div className="flex gap-2 items-end">
          <div>
            <label className="erpnext-label">Expiry window (days)</label>
            <input className="erpnext-input" style={{ width: 100 }} type="number" value={days} onChange={e => setDays(e.target.value)} />
          </div>
          <button className="erpnext-btn-secondary" onClick={load}>Reload</button>
          <button className="erpnext-btn-primary" onClick={refresh}>Push to notifications</button>
        </div>
      </div>

      <div className="flex gap-2">
        <button className={tab === 'reorder' ? 'erpnext-btn-primary' : 'erpnext-btn-secondary'} onClick={() => setTab('reorder')}>
          Reorder ({reorder.length})
        </button>
        <button className={tab === 'expiry' ? 'erpnext-btn-primary' : 'erpnext-btn-secondary'} onClick={() => setTab('expiry')}>
          Expiry / FEFO ({expiry.length})
        </button>
      </div>

      {tab === 'reorder' && (
        <div className="erpnext-card">
          <div className="px-6 py-4 border-b space-y-3" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">Below min / above max</h2>
            <ListPager pager={reorderPager} placeholder="Search reorder alerts…" />
          </div>
          <div className="p-4">
            <table className="erpnext-table">
              <thead>
                <tr style={{ background: 'var(--panel-2)' }}>
                  <th>Item</th>
                  <th>Alert</th>
                  <th className="text-right">Available</th>
                  <th className="text-right">Reorder lvl</th>
                  <th className="text-right">Max</th>
                  <th className="text-right">Suggest qty</th>
                </tr>
              </thead>
              <tbody>
                {reorderPager.pageItems.map(a => (
                  <tr key={a.item_code + a.alert_type}>
                    <td>
                      <div className="font-medium" style={{ color: 'var(--accent)' }}>{a.item_code}</div>
                      <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{a.item_name}</div>
                    </td>
                    <td>
                      <span className={`erpnext-badge ${a.alert_type === 'below_min' ? 'erpnext-badge-red' : 'erpnext-badge-yellow'}`}>
                        {a.alert_type === 'below_min' ? 'below min' : 'above max'}
                      </span>
                    </td>
                    <td className="text-right">{a.available_qty}</td>
                    <td className="text-right">{a.reorder_level || a.safety_stock}</td>
                    <td className="text-right">{a.max_stock || '—'}</td>
                    <td className="text-right">{a.suggested_qty || '—'}</td>
                  </tr>
                ))}
                {reorderPager.total === 0 && (
                  <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>All stock within min/max</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'expiry' && (
        <div className="erpnext-card">
          <div className="px-6 py-4 border-b space-y-3" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">Expiring stock (pick FEFO first)</h2>
            <ListPager pager={expiryPager} placeholder="Search expiry alerts…" />
          </div>
          <div className="p-4">
            <table className="erpnext-table">
              <thead>
                <tr style={{ background: 'var(--panel-2)' }}>
                  <th>Item</th>
                  <th>Location</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th>Days</th>
                  <th className="text-right">Avail</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {expiryPager.pageItems.map((a, i) => (
                  <tr key={`${a.item_code}-${a.location_code}-${a.batch_no}-${i}`}>
                    <td>
                      <div className="font-medium" style={{ color: 'var(--accent)' }}>{a.item_code}</div>
                      <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{a.item_name}</div>
                    </td>
                    <td>{a.warehouse_code}/{a.location_code}</td>
                    <td>{a.batch_no || '—'}</td>
                    <td>{a.expiry_date ? new Date(a.expiry_date).toLocaleDateString() : '—'}</td>
                    <td>{a.days_until_expiry}</td>
                    <td className="text-right">{a.available_qty}</td>
                    <td>
                      <span className={`erpnext-badge ${
                        a.severity === 'expired' || a.severity === 'critical' ? 'erpnext-badge-red'
                          : a.severity === 'warning' ? 'erpnext-badge-yellow'
                            : 'erpnext-badge-blue'
                      }`}>{a.severity}</span>
                    </td>
                  </tr>
                ))}
                {expiryPager.total === 0 && (
                  <tr><td colSpan={7} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No expiring batches in window</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
