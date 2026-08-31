import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'

export default function GRNAudit() {
  const [params, setSearchParams] = useSearchParams()
  const [sessions, setSessions] = useState<any[]>([])
  const [audits, setAudits] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [sample, setSample] = useState(5)
  const [custom, setCustom] = useState('')
  const [active, setActive] = useState<any[]>([])
  const [phys, setPhys] = useState<Record<number, string>>({})

  const load = () => {
    api.grnSessions().then(r => { if (r.ok) setSessions(r.data ?? []) })
    api.grnAllAudits().then(r => { if (r.ok) setAudits(r.data ?? []) })
  }
  useEffect(() => { load() }, [])

  const selectedAuditId = Number(params.get('audit') || '') || null

  const loadSessionAudits = async (id: number) => {
    const r = await api.grnAudits(id)
    if (r.ok) setActive(r.data ?? [])
  }

  const selectGRN = (id: number | null) => {
    setSelectedId(id)
    if (id) {
      setSearchParams({ session: String(id) }, { replace: true })
      loadSessionAudits(id)
    } else {
      setSearchParams({}, { replace: true })
      setActive([])
    }
  }

  const openAudit = (sessionId: number, auditId: number) => {
    setSelectedId(sessionId)
    setSearchParams({ session: String(sessionId), audit: String(auditId) }, { replace: true })
    loadSessionAudits(sessionId)
  }

  useEffect(() => {
    const sid = Number(params.get('session') || '')
    if (sid > 0 && sid !== selectedId) {
      setSelectedId(sid)
      loadSessionAudits(sid)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  useEffect(() => {
    if (!selectedAuditId) return
    const el = document.getElementById(`audit-card-${selectedAuditId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [active, selectedAuditId])

  const start = async () => {
    if (!selectedId) {
      notify({ type: 'error', title: 'Select a GRN', message: 'Pick a receipt to audit' })
      return
    }
    const r = await api.grnStartAudit(selectedId, sample)
    if (r.ok) {
      notify({
        type: 'success',
        title: r.data?.resumed ? 'Audit resumed' : 'AUDIT started',
        message: r.data?.resumed
          ? `Open audit #${r.data.id} — finish remaining counts`
          : `${r.data.sample_size} items selected at random`,
      })
      loadSessionAudits(selectedId)
      load()
    } else {
      notify({ type: 'error', title: 'AUDIT failed', message: r.error || '' })
    }
  }

  const check = async (itemId: number) => {
    const raw = phys[itemId]
    if (raw === undefined || String(raw).trim() === '') {
      notify({ type: 'error', title: 'Enter physical qty', message: 'Count the SKU before checking' })
      return
    }
    const qty = Number(raw)
    if (Number.isNaN(qty) || qty < 0) {
      notify({ type: 'error', title: 'Invalid qty', message: 'Physical qty must be 0 or more' })
      return
    }
    const r = await api.grnCheckAuditItem(itemId, { physical_qty: qty })
    if (r.ok) {
      notify({
        type: r.data.result === 'pass' ? 'success' : 'warning',
        title: r.data.result === 'pass' ? '✓ PASS' : '⚠ FAIL',
        message: r.data.result === 'fail'
          ? `System ${r.data.system_qty} / Physical ${r.data.physical_qty} — exception opened`
          : `System ${r.data.system_qty} / Physical ${r.data.physical_qty}`,
      })
      if (selectedId) loadSessionAudits(selectedId)
      load()
    } else {
      notify({ type: 'error', title: 'Check failed', message: r.error || '' })
    }
  }

  const completeAudit = async (auditId: number) => {
    if (!selectedId) return
    const r = await api.grnCompleteAudit(selectedId, auditId)
    if (r.ok) {
      notify({
        type: 'success',
        title: 'Audit completed',
        message: `#${auditId} · ${r.data?.passed ?? 0} pass · ${r.data?.failed ?? 0} fail`,
      })
      loadSessionAudits(selectedId)
      load()
    } else {
      notify({ type: 'error', title: 'Complete failed', message: r.error || '' })
    }
  }

  const receivable = sessions.filter((s: any) => {
    const st = String(s.status || '').toLowerCase()
    return !['completed', 'closed'].includes(st)
  })
  const selectedSession = sessions.find((s: any) => s.id === selectedId)
  const selectOptions = selectedSession && !receivable.some((s: any) => s.id === selectedId)
    ? [selectedSession, ...receivable]
    : receivable
  const pager = useClientPager(audits)

  const fmtQty = (n: unknown) => {
    if (n == null || n === '') return '—'
    const v = Number(n)
    if (Number.isNaN(v)) return String(n)
    return Number.isInteger(v) ? String(v) : String(v)
  }

  return (
    <div className="desk-page audit-page space-y-3">
      <div className="page-head desk-page-head">
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <h1 className="page-title">Random audit</h1>
          <p className="page-sub">Home › Inward › Random audit — physical count vs system qty after receiving</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="erpnext-btn-primary audit-start-btn"
            onClick={start}
            disabled={!selectedId}
            title={!selectedId ? 'Select a GRN first' : 'Start a random sample audit'}
          >
            + Start audit
          </button>
        </div>
      </div>

      <div className="erpnext-card p-5 space-y-4">
        <div>
          <div className="font-semibold" style={{ fontSize: 15, color: 'var(--text-color)', letterSpacing: '-0.01em' }}>Start audit</div>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.5 }}>
            Random — the system selects parts for physical verification. Choose a GRN and sample size.
          </p>
        </div>
        <div className="audit-start-row">
          <div className="audit-grn-col">
            <label className="erpnext-label" style={{ fontWeight: 600, color: 'var(--text-color)', fontSize: 13, marginBottom: 6, display: 'block' }}>GRN to audit <span style={{ color: 'var(--red-500)' }}>*</span></label>
            <div className="audit-field-box">
              <select className="erpnext-input audit-grn-select" value={selectedId ?? ''} onChange={e => {
                selectGRN(e.target.value ? +e.target.value : null)
              }}>
                <option value="">Select GRN…</option>
                {selectOptions.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.session_no} · {s.supplier || '—'} · {String(s.status_label || s.status || '').toUpperCase()}</option>
                ))}
              </select>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.4, fontWeight: 400 }}>{receivable.length} receivable · completed / closed excluded</div>
          </div>
          <div className="audit-sample-col">
            <label className="erpnext-label" style={{ fontWeight: 600, color: 'var(--text-color)', fontSize: 13, marginBottom: 6, display: 'block' }}>Sample size</label>
            <div className="audit-sample-pills">
              {[5, 10, 20].map(n => (
                <button key={n} type="button"
                  className={`${sample === n && !custom ? 'erpnext-btn-primary' : 'erpnext-btn-secondary'} audit-sample-btn`}
                  onClick={() => { setSample(n); setCustom('') }}>{n} items</button>
              ))}
              <span style={{ fontSize: 12, color: 'var(--text-dim)', flexShrink: 0 }}>or</span>
              <div className="audit-field-box audit-custom-box">
                <input className="erpnext-input audit-custom" type="number" min={1} max={100}
                  placeholder="Custom" value={custom}
                  onChange={e => { setCustom(e.target.value); if (+e.target.value > 0) setSample(+e.target.value) }} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.4, fontWeight: 400 }}>{sample} SKUs · random selection</div>
          </div>
        </div>
      </div>

      {active.map((a: any) => {
        const items = a.items || []
        const checked = items.filter((it: any) => it.result).length
        const passed = items.filter((it: any) => it.result === 'pass').length
        const failed = items.filter((it: any) => it.result === 'fail').length
        const canComplete = a.status !== 'completed' && items.length > 0 && checked === items.length
        return (
        <div
          key={a.id}
          id={`audit-card-${a.id}`}
          className={`erpnext-card p-4 space-y-3${a.id === selectedAuditId ? ' audit-card-focus' : ''}`}
        >
          <div className="flex items-center gap-3 text-sm" style={{ flexWrap: 'wrap' }}>
            <span className="font-medium">Audit #{a.id}</span>
            <span className="erpnext-badge">{a.status}</span>
            <span style={{ color: 'var(--text-dim)' }}>{checked}/{items.length || a.sample_size} checked · {passed} pass · {failed} fail</span>
            {failed > 0 && (
              <Link to="/exceptions" style={{ color: 'var(--accent)', fontSize: 12 }}>View exceptions</Link>
            )}
            {selectedId && a.status !== 'completed' && (
              <button
                className="erpnext-btn-secondary text-xs ml-auto"
                disabled={!canComplete}
                title={canComplete ? 'Mark this sample complete' : 'Check every sample SKU first'}
                onClick={() => completeAudit(a.id)}
              >Complete audit</button>
            )}
          </div>
          <div className="audit-items-wrap">
          <table className="erpnext-table text-sm audit-items-table">
            <thead>
              <tr style={{ background: 'var(--panel-2)' }}>
                <th>Part</th>
                <th className="text-right">System qty</th>
                <th className="text-right">Physical qty</th>
                <th>Result</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: any) => (
                <tr key={it.id}>
                  <td className="font-medium audit-part-cell" title={it.part_no}>{it.part_no}</td>
                  <td className="text-right">
                    <div className="audit-field-box audit-qty-box" title="System quantity on this GRN">
                      <span className="audit-qty-value">{fmtQty(it.system_qty)}</span>
                    </div>
                  </td>
                  <td className="text-right">
                    {it.result ? (
                      <div className="audit-field-box audit-qty-box">
                        <span className="audit-qty-value">{fmtQty(it.physical_qty)}</span>
                      </div>
                    ) : (
                      <div className="audit-field-box audit-qty-box">
                        <input
                          className="erpnext-input audit-qty-input"
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          placeholder="Count"
                          aria-label={`Physical quantity for ${it.part_no}`}
                          value={phys[it.id] ?? ''}
                          onChange={e => setPhys(p => ({ ...p, [it.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); check(it.id) } }}
                        />
                      </div>
                    )}
                  </td>
                  <td>
                    {it.result === 'pass' ? '✓ PASS' : it.result === 'fail' ? '⚠ FAIL' : '—'}
                  </td>
                  <td>
                    {!it.result && (
                      <button
                        className="erpnext-btn-secondary text-xs"
                        disabled={phys[it.id] === undefined || String(phys[it.id]).trim() === ''}
                        onClick={() => check(it.id)}
                      >Check</button>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5} className="text-center py-6" style={{ color: 'var(--text-dim)' }}>No sample items — receive or seed expected parts first.</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
        )
      })}

      <div className="erpnext-card overflow-x-auto p-4 space-y-3">
        <div className="font-medium">Recent audits</div>
        <ListPager pager={pager} placeholder="Search audits, GRN, supplier…" />
        <table className="erpnext-table text-sm">
          <thead>
            <tr style={{ background: 'var(--panel-2)' }}>
              <th>Audit</th><th>GRN</th><th>Supplier</th><th>Sample</th><th>Checked</th><th>Pass</th><th>Fail</th><th>Status</th><th>Started</th>
            </tr>
          </thead>
          <tbody>
            {pager.pageItems.map(a => (
              <tr
                key={a.id}
                onClick={() => openAudit(a.grn_session_id, a.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openAudit(a.grn_session_id, a.id)
                  }
                }}
                tabIndex={0}
                style={{
                  cursor: 'pointer',
                  background: selectedAuditId === a.id || selectedId === a.grn_session_id ? 'var(--panel-2)' : undefined,
                }}
              >
                <td>
                  <button type="button" className="audit-open-btn" onClick={e => { e.stopPropagation(); openAudit(a.grn_session_id, a.id) }}>
                    #{a.id}
                  </button>
                </td>
                <td>{a.session_no || '—'}</td>
                <td>{a.supplier_name || '—'}</td>
                <td>{a.sample_size}</td>
                <td>{a.checked ?? '—'}</td>
                <td>{a.passed ?? '—'}</td>
                <td>{a.failed ?? '—'}</td>
                <td>{a.status}</td>
                <td className="whitespace-nowrap">{a.started_at?.slice(0, 19)}</td>
              </tr>
            ))}
            {pager.total === 0 && (
              <tr><td colSpan={9} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No audits yet. Choose a GRN and press START AUDIT.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <style>{`
        .audit-page .page-head { min-width: 0; max-width: 100%; }
        .audit-page .page-actions { flex-shrink: 0; }
        .audit-start-btn { height: 40px; min-height: 40px; padding: 0 20px; font-size: 14px; font-weight: 600; border-radius: 6px; }
        .audit-start-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.5rem; align-items: start; }
        .audit-grn-col { min-width: 0; max-width: 480px; }
        .audit-field-box { position: relative; display: flex; align-items: stretch; height: 40px; min-width: 0; box-sizing: border-box; border: 1px solid var(--border, #d1d5db); border-radius: 6px; background: var(--card, #fff); }
        .audit-field-box:focus-within { border-color: var(--primary, #2563eb); box-shadow: 0 0 0 3px oklch(0.56 0.18 250 / 0.10); }
        .audit-grn-select,
        .audit-custom,
        .audit-qty-input { appearance: none; -webkit-appearance: none; background: transparent !important; border: 0 !important; box-shadow: none !important; color: var(--text-color); box-sizing: border-box; height: 100%; font-size: 13px; }
        .audit-grn-select { width: 100%; min-width: 0; padding: 0 36px 0 12px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .audit-field-box:has(.audit-grn-select)::after { content: ''; position: absolute; right: 14px; top: 50%; width: 6px; height: 6px; margin-top: -5px; border-right: 1.5px solid var(--text-dim, #6b7280); border-bottom: 1.5px solid var(--text-dim, #6b7280); transform: rotate(45deg); pointer-events: none; }
        .audit-sample-col { min-width: 0; }
        .audit-sample-pills { display: flex; gap: 8px; align-items: center; flex-wrap: nowrap; min-width: 0; }
        .audit-sample-btn { height: 40px; min-height: 40px; padding: 0 14px; border-radius: 6px; font-size: 13px; font-weight: 600; box-sizing: border-box; flex: 0 0 auto; }
        .audit-custom-box { width: 104px; flex: 0 0 auto; }
        .audit-custom { width: 100%; padding: 0 10px; text-align: center; font-weight: 500; }
        .audit-items-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .audit-items-table { min-width: 640px; }
        .audit-part-cell { max-width: 280px; overflow: hidden; text-overflow: ellipsis; }
        .audit-qty-box { width: 112px; flex: 0 0 auto; margin-left: auto; }
        .audit-qty-value { display: flex; align-items: center; justify-content: flex-end; width: 100%; padding: 0 12px; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--text-color); }
        .audit-qty-input { width: 100%; padding: 0 12px; text-align: right; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
        .audit-qty-input::placeholder { color: var(--text-dim); font-weight: 500; }
        .audit-card-focus { box-shadow: 0 0 0 2px var(--primary, #2563eb); }
        .audit-open-btn { background: none; border: 0; padding: 0; color: var(--accent); font: inherit; font-weight: 600; cursor: pointer; }
        @media (max-width: 720px) { .audit-start-row { grid-template-columns: minmax(0, 1fr); } .audit-grn-col { max-width: none; } .audit-sample-pills { flex-wrap: wrap; } }
      `}</style>
    </div>
  )
}
