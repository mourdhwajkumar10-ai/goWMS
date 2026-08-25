import { useEffect, useState } from 'react'
import { ArrowLeft, Plus, ScanLine, Search } from 'lucide-react'
import { api } from '../services/api'
import BarcodeScanner from '../components/BarcodeScanner'
import CameraScanner from '../components/CameraScanner'
import Comments from '../components/Comments'
import { notify } from '../components/Notifications'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'
import { useLoadMore } from '../hooks/useLoadMore'
import { useRfUi } from '../hooks/useRfUi'
import RfShell from '../components/RfShell'
import '../styles/scanner.css'

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
  const rf = useRfUi()
  const [list, setList] = useState<QiInspection[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [msg, setMsg] = useState('')
  const [rfQuery, setRfQuery] = useState('')
  const [showNew, setShowNew] = useState(false)

  const [itemCode, setItemCode] = useState('')
  const [referenceType, setReferenceType] = useState('Purchase Receipt')
  const [referenceName, setReferenceName] = useState('')
  const [sampleSize, setSampleSize] = useState('10')
  const [templates, setTemplates] = useState<any[]>([])
  const [templateId, setTemplateId] = useState('')
  const [showTmpl, setShowTmpl] = useState(false)
  const [tmplName, setTmplName] = useState('')
  const [tmplSpec, setTmplSpec] = useState('Visual,Quantity')

  const [rejectReason, setRejectReason] = useState('')
  const [readings, setReadings] = useState<any[]>([])
  const [readingsBusy, setReadingsBusy] = useState(false)

  const loadList = () => api.qiList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => {
    loadList()
    api.qiTemplates().then(r => { if (r.ok) setTemplates(r.data ?? []) })
  }, [])
  const pager = useClientPager(list)

  const createInspection = async () => {
    if (templateId) {
      const r = await api.qiFromTemplate({
        template_id: +templateId,
        item_code: itemCode,
        reference_type: referenceType,
        reference_name: referenceName,
        sample_size: +sampleSize || undefined,
      })
      if (r.ok) {
        setMsg(`Inspection ${r.data.inspection_no} from template`)
        setItemCode(''); setReferenceName('')
        loadList()
        notify({ type: 'success', title: 'From template', message: r.data.inspection_no })
      } else notify({ type: 'error', title: 'Failed', message: r.error || '' })
      return
    }
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

  const createTemplate = async () => {
    if (!tmplName) return
    const checklist = tmplSpec.split(',').map(s => s.trim()).filter(Boolean).map(specification => ({ specification, required: true }))
    const r = await api.qiTemplateCreate({ name: tmplName, checklist, sample_size: 1 })
    if (r.ok) {
      notify({ type: 'success', title: 'Template created', message: tmplName })
      setShowTmpl(false); setTmplName('')
      api.qiTemplates().then(res => { if (res.ok) setTemplates(res.data ?? []) })
    } else notify({ type: 'error', title: 'Failed', message: r.error || '' })
  }

  const openInspection = async (id: number) => {
    const r = await api.get<any>(`/qi/${id}`)
    if (r.ok) {
      setSelected(r.data)
      const rows = r.data?.readings?.length ? r.data.readings : [{ specification: 'Visual', value: '', status: 'pending', expected: '' }]
      setReadings(rows)
    }
  }

  const updateReading = (idx: number, field: string, value: string) => {
    const next = [...readings]
    next[idx] = { ...next[idx], [field]: value }
    setReadings(next)
  }

  const saveReadings = async () => {
    if (!selected) return
    setReadingsBusy(true)
    const r = await api.qiSaveReadings(selected.id, readings.map((rd: any) => ({
      id: rd.id, specification: rd.specification, value: rd.value, status: rd.status, notes: rd.notes,
    })))
    setReadingsBusy(false)
    if (r.ok) {
      notify({ type: r.data.failed ? 'warning' : 'success', title: 'Readings saved', message: r.data.failed ? `${r.data.failed} failed spec(s)` : `${r.data.saved} reading(s)` })
      await openInspection(selected.id)
    } else {
      notify({ type: 'error', title: 'Save failed', message: r.error || '' })
    }
    return r.ok
  }

  const handleScan = (code: string) => {
    setShowScanner(false)
    setItemCode(code)
  }

  const acceptInspection = async () => {
    if (!selected) return
    await saveReadings()
    const r = await api.post<{ moved_to?: string }>(`/qi/${selected.id}/submit`, { status: 'accepted' })
    if (r.ok) {
      notify({
        type: 'success',
        title: 'Accepted',
        message: r.data?.moved_to
          ? `${selected.item_code} → ${r.data.moved_to} (ready for putaway)`
          : `${selected.item_code} passed inspection`,
      })
      setSelected(null)
      loadList()
    }
  }

  const rejectInspection = async () => {
    if (!selected) return
    await saveReadings()
    const r = await api.post<{ moved_to?: string }>(`/qi/${selected.id}/submit`, { status: 'rejected', reason: rejectReason })
    if (r.ok) {
      notify({
        type: 'warning',
        title: 'Rejected',
        message: r.data?.moved_to
          ? `${selected.item_code} moved to ${r.data.moved_to}`
          : `${selected.item_code} failed inspection`,
      })
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

  const rfList = pager.filtered.filter(q => {
    const qStr = rfQuery.trim().toLowerCase()
    if (!qStr) return true
    return `${q.inspection_no} ${q.item_code} ${q.reference_name || ''} ${q.status || ''}`.toLowerCase().includes(qStr)
  })
  const rfListMore = useLoadMore(rfList, 10, `${rfQuery}|${rfList.length}`)

  const qiStat = selected
    ? String(readings.filter((r: any) => r.value).length)
    : String(list.filter(q => (q.status || '').toLowerCase() === 'accepted').length)
  const qiStatOf = selected ? `/ ${readings.length}` : undefined

  if (rf) {
    return (
      <RfShell
        title="Quality Inspection"
        stat={qiStat}
        statOf={qiStatOf}
        meta={selected ? selected.inspection_no : undefined}
      >
        {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

        {!selected ? (
          <>
            <div className="scan-bottom-bar">
              <div className="scan-input-chip">
                <Search size={16} strokeWidth={1.8} />
                <input
                  type="search"
                  value={rfQuery}
                  onChange={e => setRfQuery(e.target.value)}
                  placeholder="Search inspections…"
                  autoComplete="off"
                />
              </div>
              <button
                type="button"
                className="scan-icon-btn primary"
                onClick={() => setShowNew(!showNew)}
                aria-label="New inspection"
              >
                <Plus size={18} strokeWidth={1.8} />
              </button>
            </div>

            {showNew && (
              <div className="scan-section-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="scan-section-title">Create inspection</div>
                <div className="scan-live-viewport" style={{ borderRadius: 12, overflow: 'hidden', minHeight: 140 }}>
                  <CameraScanner
                    open
                    embedded
                    minimal
                    continuous
                    onClose={() => {}}
                    onScan={(code) => {
                      const clean = String(code || '').trim()
                      if (clean) setItemCode(clean)
                    }}
                  />
                </div>
                <div className="scan-input-chip">
                  <ScanLine size={16} strokeWidth={1.8} />
                  <input
                    value={itemCode}
                    onChange={e => setItemCode(e.target.value)}
                    placeholder="Item code…"
                    autoComplete="off"
                  />
                  <button type="button" className="scan-icon-btn" style={{ width: 36, height: 36 }} onClick={() => setShowScanner(true)} aria-label="Scan item">
                    <ScanLine size={16} />
                  </button>
                </div>
                <select className="scan-count-input" value={templateId} onChange={e => setTemplateId(e.target.value)}>
                  <option value="">No template</option>
                  {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select className="scan-count-input" value={referenceType} onChange={e => setReferenceType(e.target.value)}>
                  <option>Purchase Receipt</option>
                  <option>Purchase Order</option>
                  <option>Stock Entry</option>
                </select>
                <input className="scan-count-input" value={referenceName} onChange={e => setReferenceName(e.target.value)} placeholder="Reference name" />
                <input className="scan-count-input" type="number" value={sampleSize} onChange={e => setSampleSize(e.target.value)} placeholder="Sample size" />
                <button type="button" className="scan-btn scan-btn-primary" onClick={() => { void createInspection(); setShowNew(false) }}>Create</button>
                <button type="button" className="scan-btn scan-btn-outline" onClick={() => setShowNew(false)}>Cancel</button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rfListMore.visible.map(q => (
                <button
                  key={q.id}
                  type="button"
                  className="scan-select-card"
                  onClick={() => openInspection(q.id)}
                  style={{ textAlign: 'left', width: '100%', cursor: 'pointer' }}
                >
                  <div className="scan-select-card-title">{q.inspection_no}</div>
                  <div className="scan-select-card-sub">{q.item_code} · {q.reference_name || '—'}</div>
                  <div className="scan-select-card-meta">
                    <span>{q.status || 'pending'}</span>
                    <span>sample {q.sample_size ?? '—'}</span>
                    <span style={{ color: 'var(--primary)' }}>Open →</span>
                  </div>
                </button>
              ))}
              {rfListMore.hasMore && (
                <button type="button" className="scan-btn scan-btn-outline" onClick={rfListMore.loadMore}>
                  Load more ({rfListMore.remaining} left)
                </button>
              )}
              {rfList.length === 0 && (
                <div className="scan-section-card" style={{ textAlign: 'center' }}>
                  <p style={{ fontWeight: 600, marginBottom: 6, color: 'var(--foreground)' }}>No inspections yet</p>
                  <button type="button" className="scan-btn scan-btn-primary" onClick={() => setShowNew(true)}>
                    <Plus size={16} /> New inspection
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <button type="button" className="scan-btn scan-btn-outline" onClick={() => setSelected(null)} style={{ alignSelf: 'flex-start', width: 'auto' }}>
              <ArrowLeft size={16} strokeWidth={1.8} /> Back to list
            </button>

            <div className="scan-section-card">
              <div className="scan-select-card-title">{selected.inspection_no}</div>
              <div className="scan-select-card-sub">
                {selected.item_code} · {selected.reference_name || '—'} · {selected.status || 'pending'}
              </div>
              <div className="scan-select-card-meta" style={{ marginTop: 8 }}>
                <span>Sample {selected.sample_size ?? '—'}</span>
              </div>
            </div>

            <div className="scan-section-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="scan-section-title" style={{ margin: 0 }}>Checklist readings</div>
                {selected.status === 'pending' && (
                  <button
                    type="button"
                    className="scan-btn scan-btn-outline scan-btn-sm"
                    style={{ width: 'auto' }}
                    onClick={() => setReadings([...readings, { specification: '', value: '', status: 'pending' }])}
                  >
                    + Spec
                  </button>
                )}
              </div>

              {readings.map((rd: any, idx: number) => (
                <div key={rd.id || idx} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 10, borderBottom: idx < readings.length - 1 ? '1px solid var(--border)' : undefined }}>
                  {rd.id ? (
                    <div className="scan-row-code">{rd.specification}</div>
                  ) : (
                    <input
                      className="scan-count-input"
                      value={rd.specification || ''}
                      onChange={e => updateReading(idx, 'specification', e.target.value)}
                      placeholder="Spec name"
                      disabled={selected.status !== 'pending'}
                    />
                  )}
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                    Expected: {rd.expected || (rd.min_value != null || rd.max_value != null ? `${rd.min_value ?? '—'} – ${rd.max_value ?? '—'}` : '—')}
                  </div>
                  <input
                    className="scan-count-input"
                    value={rd.value || ''}
                    onChange={e => updateReading(idx, 'value', e.target.value)}
                    placeholder="Actual reading"
                    disabled={selected.status !== 'pending'}
                  />
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Result: {rd.status || 'pending'}</div>
                </div>
              ))}

              {selected.status === 'pending' && (
                <button
                  type="button"
                  className="scan-btn scan-btn-outline"
                  disabled={readingsBusy}
                  onClick={() => { void saveReadings() }}
                >
                  {readingsBusy ? 'Saving…' : 'Save readings'}
                </button>
              )}
            </div>

            {selected.status === 'pending' && (
              <div className="scan-section-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="scan-section-title">Inspection result</div>
                <input
                  className="scan-count-input"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Reject reason (if rejecting)"
                />
                <button type="button" className="scan-btn scan-btn-success" onClick={() => void acceptInspection()}>
                  Accept
                </button>
                <button type="button" className="scan-btn scan-btn-danger" onClick={() => void rejectInspection()}>
                  Reject
                </button>
              </div>
            )}
          </>
        )}
      </RfShell>
    )
  }

  return (
    <div className="desk-page space-y-3">
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
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="erpnext-label">Item Code *</label>
                  <div className="flex gap-1">
                    <input className="erpnext-input" value={itemCode} onChange={e => setItemCode(e.target.value)} placeholder="ITEM-001" />
                    <button onClick={() => setShowScanner(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>📷</button>
                  </div>
                </div>
                <div>
                  <label className="erpnext-label">QC Template</label>
                  <select className="erpnext-input" value={templateId} onChange={e => setTemplateId(e.target.value)}>
                    <option value="">None</option>
                    {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
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
                <div className="flex items-end gap-2">
                  <button onClick={createInspection} className="erpnext-btn-primary">Create</button>
                  <button onClick={() => setShowTmpl(!showTmpl)} className="erpnext-btn-secondary">+ Template</button>
                </div>
              </div>
              {showTmpl && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div><label className="erpnext-label">Template name</label><input className="erpnext-input" value={tmplName} onChange={e => setTmplName(e.target.value)} /></div>
                  <div><label className="erpnext-label">Checklist specs (comma)</label><input className="erpnext-input" value={tmplSpec} onChange={e => setTmplSpec(e.target.value)} /></div>
                  <div className="flex items-end"><button className="erpnext-btn-primary" onClick={createTemplate}>Save Template</button></div>
                </div>
              )}
            </div>
          </div>

          {msg && (
            <div style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', color: 'var(--green)', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
              {msg}
            </div>
          )}

          <div className="erpnext-card">
            <div className="px-4 py-3 space-y-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-semibold">Inspections</h3>
              <ListPager pager={pager} placeholder="Search inspections…" />
            </div>
            <div className="table-wrap">
              <table className="erpnext-table">
                <thead>
                  <tr><th>Inspection No</th><th>Item</th><th>Reference</th><th>Sample</th><th>Status</th><th>Created</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {pager.pageItems.map(q => (
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
                  {pager.total === 0 && <tr><td colSpan={7} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No inspections</td></tr>}
                </tbody>
              </table>
            </div>
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
              <div><span style={{ color: 'var(--text-dim)' }}>Created: </span>{new Date(selected.created_at || Date.now()).toLocaleString()}</div>
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm">Checklist readings</h4>
                <button type="button" className="erpnext-btn-secondary text-xs" onClick={() => setReadings([...readings, { specification: '', value: '', status: 'pending' }])}>+ Spec</button>
              </div>
              <div className="table-wrap">
                <table className="erpnext-table text-sm">
                  <thead>
                    <tr>
                      <th>Specification</th>
                      <th>Expected</th>
                      <th>Actual</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readings.map((rd: any, idx: number) => (
                      <tr key={rd.id || idx}>
                        <td>
                          {rd.id ? rd.specification : (
                            <input className="erpnext-input" value={rd.specification || ''} onChange={e => updateReading(idx, 'specification', e.target.value)} placeholder="Spec name" />
                          )}
                        </td>
                        <td style={{ color: 'var(--text-dim)' }}>{rd.expected || (rd.min_value != null || rd.max_value != null ? `${rd.min_value ?? '—'} – ${rd.max_value ?? '—'}` : '—')}</td>
                        <td>
                          <input className="erpnext-input" value={rd.value || ''} onChange={e => updateReading(idx, 'value', e.target.value)} placeholder="Reading" disabled={selected.status !== 'pending'} />
                        </td>
                        <td>{statusBadge(rd.status || 'pending')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selected.status === 'pending' && (
                <button className="erpnext-btn-secondary text-xs mt-2" disabled={readingsBusy} onClick={() => { void saveReadings() }}>
                  {readingsBusy ? 'Saving…' : 'Save readings'}
                </button>
              )}
            </div>

            {selected.status === 'pending' && (
              <div className="mt-4">
                <h4 className="font-medium text-sm mb-2">Inspection Result</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="flex gap-2">
                    <button onClick={acceptInspection} className="erpnext-btn-primary" style={{ background: 'var(--green)' }}>✓ Accept</button>
                    <button onClick={() => rejectInspection()} className="erpnext-btn-primary" style={{ background: 'var(--red)' }}>✕ Reject</button>
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
