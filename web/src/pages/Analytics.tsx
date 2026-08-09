import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'

interface DashboardData {
  TotalItems: number
  TotalStock: number
  PendingGRN: number
  OpenPickLists: number
  PendingBackorders: number
  DueCycleCounts: number
}

interface FastSlow {
  item_code: string
  item_name: string
  avg_daily_sales: number | null
  turnover_ratio: number | null
  days_since_last_sale: number | null
  classification: string
}

interface ExpiryItem {
  item_code: string
  item_name: string
  qty: number | null
  batch_no: string | null
  expiry_date: string | null
  days_until_expiry: number | null
}

export default function Analytics() {
  const [dash, setDash] = useState<DashboardData | null>(null)
  const [fast, setFast] = useState<FastSlow[]>([])
  const [slow, setSlow] = useState<FastSlow[]>([])
  const [dead, setDead] = useState<FastSlow[]>([])
  const [expiry, setExpiry] = useState<ExpiryItem[]>([])
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'fast' | 'slow' | 'dead' | 'expiry'>('fast')

  useEffect(() => {
    api.dashboard().then(r => { if (r.ok) setDash(r.data) }).catch((e) => setError((e as Error).message))
    api.get<FastSlow[]>('/analytics/fast-moving').then(r => { if (r.ok) setFast(r.data ?? []) }).catch(() => {})
    api.get<FastSlow[]>('/analytics/slow-moving').then(r => { if (r.ok) setSlow(r.data ?? []) }).catch(() => {})
    api.get<FastSlow[]>('/analytics/dead-stock').then(r => { if (r.ok) setDead(r.data ?? []) }).catch(() => {})
    api.get<ExpiryItem[]>('/analytics/expiry').then(r => { if (r.ok) setExpiry(r.data ?? []) }).catch(() => {})
  }, [])

  const kpis = dash ? [
    { label: 'Total Items', value: dash.TotalItems, cls: '' },
    { label: 'Total Stock', value: dash.TotalStock, cls: 'accent' },
    { label: 'Pending GRN', value: dash.PendingGRN, cls: 'amber' },
    { label: 'Open Pick Lists', value: dash.OpenPickLists, cls: 'green' },
    { label: 'Pending Backorders', value: dash.PendingBackorders, cls: 'red' },
    { label: 'Due Cycle Counts', value: dash.DueCycleCounts, cls: 'amber' },
  ] : []

  const tabs = [
    { key: 'fast', label: 'Fast Moving', count: fast.length },
    { key: 'slow', label: 'Slow Moving', count: slow.length },
    { key: 'dead', label: 'Dead Stock', count: dead.length },
    { key: 'expiry', label: 'Expiring', count: expiry.length },
  ] as const

  const renderMovementTable = (rows: FastSlow[], type: string) => (
    <div className="erpnext-card">
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="font-semibold">{type} ({rows.length})</h3>
      </div>
      <table className="erpnext-table">
        <thead>
          <tr><th>Item</th><th>Name</th><th>Classification</th><th>Turnover</th><th>Days Since Sale</th><th>Daily Sales</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.item_code}>
              <td className="font-medium">{r.item_code}</td>
              <td>{r.item_name || '—'}</td>
              <td>
                <span className={`erpnext-badge ${r.classification === 'fast' ? 'erpnext-badge-green' : r.classification === 'slow' ? 'erpnext-badge-yellow' : 'erpnext-badge-red'}`}>
                  {r.classification}
                </span>
              </td>
              <td>{r.turnover_ratio?.toFixed(2) ?? '—'}</td>
              <td>{r.days_since_last_sale ?? '—'}</td>
              <td>{r.avg_daily_sales?.toFixed(2) ?? '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No data</td></tr>}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Analytics</h2>
      </div>

      {error && (
        <div className="error-banner">{error}</div>
      )}

      {dash && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {kpis.map(k => (
            <div className={`card kpi ${k.cls}`} key={k.label}>
              <span className="value">{k.value}</span>
              <span className="label">{k.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
            style={{
              borderColor: activeTab === t.key ? 'var(--accent)' : 'transparent',
              color: activeTab === t.key ? 'var(--accent)' : 'var(--text-dim)',
              background: 'none',
              cursor: 'pointer',
            }}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {activeTab === 'fast' && renderMovementTable(fast, 'Fast Moving Items')}
      {activeTab === 'slow' && renderMovementTable(slow, 'Slow Moving Items')}
      {activeTab === 'dead' && renderMovementTable(dead, 'Dead Stock')}
      {activeTab === 'expiry' && (
        <div className="erpnext-card">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold">Expiring Items ({expiry.length})</h3>
          </div>
          <table className="erpnext-table">
            <thead>
              <tr><th>Item</th><th>Name</th><th>Qty</th><th>Batch</th><th>Expiry Date</th><th>Days Left</th></tr>
            </thead>
            <tbody>
              {expiry.map(r => (
                <tr key={r.item_code + r.batch_no}>
                  <td className="font-medium">{r.item_code}</td>
                  <td>{r.item_name || '—'}</td>
                  <td>{r.qty ?? '—'}</td>
                  <td>{r.batch_no || '—'}</td>
                  <td>{r.expiry_date ? new Date(r.expiry_date).toLocaleDateString() : '—'}</td>
                  <td>
                    {r.days_until_expiry !== null ? (
                      <span className={`erpnext-badge ${r.days_until_expiry <= 30 ? 'erpnext-badge-red' : r.days_until_expiry <= 90 ? 'erpnext-badge-yellow' : 'erpnext-badge-green'}`}>
                        {r.days_until_expiry} days
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
              {expiry.length === 0 && <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No expiring items</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
