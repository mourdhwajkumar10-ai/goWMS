import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'

export default function GRNFollowUps() {
  const [rows, setRows] = useState<any[]>([])

  useEffect(() => {
    api.grnAllFollowUps().then(r => { if (r.ok) setRows(r.data ?? []) })
  }, [])
  const pager = useClientPager(rows)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">FOLLOW-UP RECEIPT</h1>
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
          Home › Inward › Follow-Up Receipts — this is the follow-up list, not the GRN landing page
        </p>
        <p className="text-sm mt-1">
          Later deliveries of missing / short material are linked to the original GRN so history stays continuous.
          Open a follow-up to receive the remaining quantity.
        </p>
      </div>
      <div className="flex gap-2">
        <Link to="/exceptions" className="erpnext-btn-secondary text-xs">Open Exceptions page</Link>
        <Link to="/grn" className="erpnext-btn-secondary text-xs">Back to GRN</Link>
      </div>
      <div className="erpnext-card overflow-x-auto p-4 space-y-3">
        <ListPager pager={pager} placeholder="Search follow-up GRN, supplier…" />
        <table className="erpnext-table text-sm">
          <thead>
            <tr style={{ background: 'var(--panel-2)' }}>
              <th>Follow-up GRN</th>
              <th>Linked original GRN</th>
              <th>Supplier</th>
              <th>Status</th>
              <th>Expected remaining</th>
              <th>Received</th>
              <th>Outstanding</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {pager.pageItems.map(f => (
              <tr key={f.id}>
                <td>
                  <Link to={`/grn/${f.id}`} style={{ color: 'var(--accent)' }}>
                    {f.session_no}
                  </Link>
                  <div className="text-xs" style={{ color: 'var(--text-dim)' }}>Open to receive remaining qty</div>
                </td>
                <td>
                  {f.parent_grn_id ? (
                    <Link to={`/grn/${f.parent_grn_id}`} style={{ color: 'var(--accent)' }}>
                      {f.parent_session_no || `#${f.parent_grn_id}`}
                    </Link>
                  ) : '—'}
                </td>
                <td>{f.supplier_name || '—'}</td>
                <td>{f.status}</td>
                <td>{f.expected_qty ?? '—'}</td>
                <td>{f.received_qty ?? '—'}</td>
                <td>{f.outstanding_qty ?? '—'}</td>
                <td className="whitespace-nowrap">{f.created_at?.slice(0, 19)}</td>
              </tr>
            ))}
            {pager.total === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>
                  No follow-up receipts yet. Resolve a shortage on the Exceptions page with “Supplier will send later”
                  to create a FOLLOW-UP RECEIPT linked to the original GRN.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
