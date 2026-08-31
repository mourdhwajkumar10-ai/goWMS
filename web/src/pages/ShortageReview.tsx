import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'
import { PageHead } from '../components/desktop/PageHead'

type Flag = {
  id: number
  flag_no: string
  pick_list_id: number
  sales_order_no: string
  item_code: string
  item_name: string
  location_code: string
  qty: number
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  flagged_at: string
  reviewed_at?: string | null
  review_note?: string
  backorder_no?: string
}

export default function ShortageReview() {
  const [tab, setTab] = useState<'pending' | 'all'>('pending')
  const [list, setList] = useState<Flag[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [notes, setNotes] = useState<Record<number, string>>({})

  const load = () => {
    api.shortageFlags(tab).then(r => { if (r.ok) setList(r.data ?? []) })
  }
  useEffect(() => { load() }, [tab])
  const pager = useClientPager(list)

  const approve = async (f: Flag) => {
    setBusyId(f.id)
    try {
      const r = await api.shortageFlagApprove(f.id, notes[f.id] || '')
      if (r.ok) {
        notify({ type: 'success', title: 'Moved to backorder', message: `${f.item_code} · ${r.data.backorder_no}` })
        load()
      } else {
        notify({ type: 'error', title: 'Failed', message: r.error || 'picking.override required' })
      }
    } finally {
      setBusyId(null)
    }
  }

  const reject = async (f: Flag) => {
    const note = (notes[f.id] || '').trim()
    if (!note) {
      notify({ type: 'error', title: 'Note required', message: 'Explain why this is being sent back to the pick queue' })
      return
    }
    setBusyId(f.id)
    try {
      const r = await api.shortageFlagReject(f.id, note)
      if (r.ok) {
        notify({ type: 'success', title: 'Sent back to pick queue', message: f.item_code })
        load()
      } else {
        notify({ type: 'error', title: 'Failed', message: r.error || 'picking.override required' })
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="desk-page space-y-3">
      <PageHead
        eyebrow="Outbound"
        title="Shortage review"
        subtitle={'Lines pickers flagged "can\'t find it". Approve → backorder, or reject → re-pick queue.'}
        actions={
          <div className="flex gap-2">
            <button className={tab === 'pending' ? 'erpnext-btn-primary' : 'erpnext-btn-secondary'} onClick={() => setTab('pending')}>Pending</button>
            <button className={tab === 'all' ? 'erpnext-btn-primary' : 'erpnext-btn-secondary'} onClick={() => setTab('all')}>All</button>
          </div>
        }
      />

      <div className="erpnext-card">
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <ListPager pager={pager} placeholder="Search flags…" />
        </div>
        <table className="erpnext-table">
          <thead>
            <tr>
              <th>Flag</th><th>SO</th><th>Item</th><th>Location</th><th>Qty</th>
              <th>Reason</th><th>Flagged</th><th>Status</th><th style={{ minWidth: 280 }}>Review</th>
            </tr>
          </thead>
          <tbody>
            {pager.pageItems.map(f => (
              <tr key={f.id}>
                <td className="font-medium">{f.flag_no}</td>
                <td>{f.sales_order_no}</td>
                <td>{f.item_code}{f.item_name ? ` · ${f.item_name}` : ''}</td>
                <td>{f.location_code || '—'}</td>
                <td>{f.qty}</td>
                <td style={{ maxWidth: 220, whiteSpace: 'normal' }}>{f.reason}</td>
                <td>{f.flagged_at}</td>
                <td>
                  <span className={
                    f.status === 'pending' ? 'erpnext-badge-yellow'
                      : f.status === 'approved' ? 'erpnext-badge-green' : 'erpnext-badge-red'
                  }>
                    {f.status}
                  </span>
                  {f.backorder_no && <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{f.backorder_no}</div>}
                </td>
                <td>
                  {f.status === 'pending' ? (
                    <div className="flex flex-col gap-2">
                      <input
                        className="erpnext-input text-xs"
                        placeholder="Note (required to reject)"
                        value={notes[f.id] || ''}
                        onChange={e => setNotes(n => ({ ...n, [f.id]: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <button
                          className="erpnext-btn-primary text-xs"
                          disabled={busyId === f.id}
                          onClick={() => void approve(f)}
                        >
                          Approve → backorder
                        </button>
                        <button
                          className="erpnext-btn-secondary text-xs"
                          disabled={busyId === f.id}
                          onClick={() => void reject(f)}
                        >
                          Reject → re-pick
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{f.review_note || '—'}</div>
                  )}
                </td>
              </tr>
            ))}
            {pager.total === 0 && (
              <tr><td colSpan={9} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>
                {tab === 'pending' ? 'No pending shortage flags' : 'No shortage flags yet'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
