import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'

export default function GRNFollowUps() {
  const [rows, setRows] = useState<any[]>([])

  useEffect(() => {
    api.grnAllFollowUps().then(r => { if (r.ok) setRows(r.data ?? []) })
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Follow-Up Receipts</h1>
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
          Linked receipts for short / missing material from original GRNs
        </p>
      </div>
      <div className="erpnext-card overflow-x-auto">
        <table className="erpnext-table text-sm">
          <thead>
            <tr style={{ background: 'var(--panel-2)' }}>
              <th>Follow-up GRN</th><th>Parent GRN</th><th>Supplier</th><th>Status</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(f => (
              <tr key={f.id}>
                <td>
                  <Link to="/grn" style={{ color: 'var(--accent)' }}
                    onClick={() => sessionStorage.setItem('gowms_open_grn', String(f.id))}>
                    {f.session_no}
                  </Link>
                </td>
                <td>
                  {f.parent_grn_id ? (
                    <Link to="/grn" style={{ color: 'var(--accent)' }}
                      onClick={() => sessionStorage.setItem('gowms_open_grn', String(f.parent_grn_id))}>
                      {f.parent_session_no || `#${f.parent_grn_id}`}
                    </Link>
                  ) : '—'}
                </td>
                <td>{f.supplier_name || '—'}</td>
                <td>{f.status}</td>
                <td className="whitespace-nowrap">{f.created_at?.slice(0, 19)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No follow-up receipts</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
