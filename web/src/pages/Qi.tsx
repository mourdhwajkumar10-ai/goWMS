import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, Plus, ScanLine, Search } from 'lucide-react'
import { api } from '../services/api'
import BarcodeScanner from '../components/BarcodeScanner'
import ScanCard from '../components/scan/ScanCard'
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
  created_at?: string
  qty?: number
}

function fmtWhen(s?: string | null) {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

function fmtQty(n: unknown) {
  if (n == null || n === '') return '—'
  const v = Number(n)
  if (Number.isNaN(v)) return String(n)
  return String(v)
}

export default function Qi() {
  const rf = useRfUi()
  const [params, setSearchParams] = useSearchParams()
  const [list, setList] = useState<QiInspection[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [showScanner, setShowScanner] = useState(false)
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

  const loadInspection = async (id: number) => {
    const r = await api.get<any>(`/qi/${id}`)
    if (r.ok) {
      setSelected(r.data)
      const rows = r.data?.readings?.length ? r.data.readings : [{ specification: 'Visual', value: '', status: 'pending', expected: '' }]
      setReadings(rows)
    } else {
      notify({ type: 'error', title: 'Open failed', message: r.error || 'Inspection not found' })
    }
  }

  const openInspection = (id: number) => {
    setSearchParams({ id: String(id) }, { replace: true })
  }

  const closeInspection = () => {
    setSelected(null)
    setSearchParams({}, { replace: true })
  }

  useEffect(() => {
    const id = Number(params.get('id') || '')
    if (id > 0) {
      if (selected?.id !== id) void loadInspection(id)
    } else if (selected) {
      setSelected(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  useEffect(() => {
    if (!selected?.id) return
    document.getElementById(`qi-card-${selected.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selected?.id])

  const createInspection = async () => {
    if (!itemCode.trim()) {
      notify({ type: 'error', title: 'Item code required', message: 'Scan or enter the item to inspect' })
      return
    }
    if (templateId) {
      const r = await api.qiFromTemplate({
        template_id: +templateId,
        item_code: itemCode,
        reference_type: referenceType,
        reference_name: referenceName,
        sample_size: +sampleSize || undefined,
      })
      if (r.ok) {
        setItemCode(''); setReferenceName('')
        loadList()
        notify({ type: 'success', title: 'From template', message: r.data.inspection_no })
        if (r.data?.id) openInspection(r.data.id)
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
      setItemCode(''); setReferenceName('')
      loadList()
      notify({ type: 'success', title: 'Inspection Created', message: r.data.inspection_no })
      if (r.data?.id) openInspection(r.data.id)
    } else notify({ type: 'error', title: 'Failed', message: r.error || '' })
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
      await loadInspection(selected.id)
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
      closeInspection()
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
      closeInspection()
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
                <ScanCard
                  state="idle"
                  onManualEntry={(code) => setItemCode(code)}
                  onMarkDamaged={() => {}}
                  canMarkDamaged={false}
                  showMarkDamaged={false}
                  onRestart={() => {}}
                  showActionRow={false}
                  placeholder="Item code…"
                  readyTitle="Scan item"
                  readySubtitle="Or enter code manually"
                />
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
            <button type="button" className="scan-btn scan-btn-outline" onClick={closeInspection} style={{ alignSelf: 'flex-start', width: 'auto' }}>
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
    <div className="desk-page qi-page space-y-3">
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      <div className="page-head desk-page-head">
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <h1 className="page-title">Quality inspection</h1>
          <p className="page-sub">Home › Inward › Quality inspection — sample check against expected specs after receiving</p>
        </div>
        <div className="page-actions">
          <button type="button" className="erpnext-btn-secondary qi-head-btn" onClick={() => setShowScanner(true)}>
            <ScanLine size={16} strokeWidth={1.8} /> Scan item
          </button>
          <button
            type="button"
            className="erpnext-btn-primary qi-head-btn"
            onClick={() => { void createInspection() }}
            disabled={!itemCode.trim()}
            title={!itemCode.trim() ? 'Enter or scan an item first' : 'Create inspection'}
          >
            + Create inspection
          </button>
        </div>
      </div>

      <div className="erpnext-card p-5 space-y-4">
        <div>
          <div className="font-semibold" style={{ fontSize: 15, color: 'var(--text-color)', letterSpacing: '-0.01em' }}>Create inspection</div>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.5 }}>
            Scan or enter an item, set sample size, then record expected vs actual readings.
          </p>
        </div>
        <div className="qi-form-grid">
          <div className="qi-field qi-field-wide">
            <label className="erpnext-label qi-label">Item code <span style={{ color: 'var(--red-500)' }}>*</span></label>
            <div className="qi-field-box">
              <input className="erpnext-input qi-control" value={itemCode} onChange={e => setItemCode(e.target.value)} placeholder="Scan or type item code" />
              <button type="button" className="qi-scan-in-field" onClick={() => setShowScanner(true)} aria-label="Scan item">
                <ScanLine size={16} strokeWidth={1.8} />
              </button>
            </div>
          </div>
          <div className="qi-field">
            <label className="erpnext-label qi-label">QC template</label>
            <div className="qi-field-box">
              <select className="erpnext-input qi-control qi-select" value={templateId} onChange={e => setTemplateId(e.target.value)}>
                <option value="">None</option>
                {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div className="qi-field">
            <label className="erpnext-label qi-label">Reference type</label>
            <div className="qi-field-box">
              <select className="erpnext-input qi-control qi-select" value={referenceType} onChange={e => setReferenceType(e.target.value)}>
                <option>Purchase Receipt</option>
                <option>Purchase Order</option>
                <option>Stock Entry</option>
              </select>
            </div>
          </div>
          <div className="qi-field">
            <label className="erpnext-label qi-label">Reference name</label>
            <div className="qi-field-box">
              <input className="erpnext-input qi-control" value={referenceName} onChange={e => setReferenceName(e.target.value)} placeholder="PR-001" />
            </div>
          </div>
          <div className="qi-field">
            <label className="erpnext-label qi-label">Sample size</label>
            <div className="qi-field-box qi-qty-box">
              <input className="erpnext-input qi-control qi-qty-input" type="number" min={1} value={sampleSize} onChange={e => setSampleSize(e.target.value)} placeholder="Count" />
            </div>
            <div className="qi-hint">{sampleSize || 0} pieces to inspect</div>
          </div>
          <div className="qi-field qi-field-actions">
            <label className="erpnext-label qi-label">&nbsp;</label>
            <button type="button" className="erpnext-btn-secondary qi-head-btn" onClick={() => setShowTmpl(!showTmpl)}>+ Template</button>
          </div>
        </div>
        {showTmpl && (
          <div className="qi-form-grid">
            <div className="qi-field">
              <label className="erpnext-label qi-label">Template name</label>
              <div className="qi-field-box">
                <input className="erpnext-input qi-control" value={tmplName} onChange={e => setTmplName(e.target.value)} placeholder="Incoming visual" />
              </div>
            </div>
            <div className="qi-field qi-field-wide">
              <label className="erpnext-label qi-label">Checklist specs</label>
              <div className="qi-field-box">
                <input className="erpnext-input qi-control" value={tmplSpec} onChange={e => setTmplSpec(e.target.value)} placeholder="Visual, Quantity" />
              </div>
              <div className="qi-hint">Comma-separated spec names</div>
            </div>
            <div className="qi-field qi-field-actions">
              <label className="erpnext-label qi-label">&nbsp;</label>
              <button type="button" className="erpnext-btn-primary qi-head-btn" onClick={() => void createTemplate()}>Save template</button>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div id={`qi-card-${selected.id}`} className="erpnext-card p-4 space-y-4 qi-card-focus">
          <div className="flex items-center gap-3 text-sm" style={{ flexWrap: 'wrap' }}>
            <span className="font-medium">{selected.inspection_no}</span>
            {statusBadge(selected.status || 'pending')}
            <span style={{ color: 'var(--text-dim)' }}>{selected.item_code} · {selected.reference_name || 'no reference'}</span>
            <button type="button" className="erpnext-btn-secondary text-xs ml-auto" onClick={closeInspection}>Close</button>
          </div>
          <div className="qi-meta-row">
            <div className="qi-field">
              <label className="erpnext-label qi-label">Item</label>
              <div className="qi-field-box"><span className="qi-qty-value" style={{ justifyContent: 'flex-start' }}>{selected.item_code}</span></div>
            </div>
            <div className="qi-field">
              <label className="erpnext-label qi-label">Qty</label>
              <div className="qi-field-box qi-qty-box"><span className="qi-qty-value">{fmtQty(selected.qty)}</span></div>
            </div>
            <div className="qi-field">
              <label className="erpnext-label qi-label">Sample size</label>
              <div className="qi-field-box qi-qty-box"><span className="qi-qty-value">{fmtQty(selected.sample_size)}</span></div>
            </div>
            <div className="qi-field">
              <label className="erpnext-label qi-label">Created</label>
              <div className="qi-field-box"><span className="qi-qty-value" style={{ justifyContent: 'flex-start', fontWeight: 500 }}>{fmtWhen(selected.created_at)}</span></div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="font-medium text-sm">Checklist readings</div>
              {selected.status === 'pending' && (
                <button type="button" className="erpnext-btn-secondary text-xs ml-auto" onClick={() => setReadings([...readings, { specification: '', value: '', status: 'pending' }])}>+ Spec</button>
              )}
            </div>
            <div className="qi-items-wrap">
              <table className="erpnext-table text-sm">
                <thead>
                  <tr style={{ background: 'var(--panel-2)' }}>
                    <th>Specification</th>
                    <th>Expected</th>
                    <th>Actual</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.map((rd: any, idx: number) => (
                    <tr key={rd.id || idx}>
                      <td className="font-medium">
                        {rd.id ? rd.specification : (
                          <div className="qi-field-box">
                            <input className="erpnext-input qi-control" value={rd.specification || ''} onChange={e => updateReading(idx, 'specification', e.target.value)} placeholder="Spec name" />
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="qi-field-box qi-qty-box">
                          <span className="qi-qty-value">{rd.expected || (rd.min_value != null || rd.max_value != null ? `${rd.min_value ?? '—'} - ${rd.max_value ?? '—'}` : '—')}</span>
                        </div>
                      </td>
                      <td>
                        <div className="qi-field-box qi-qty-box">
                          <input
                            className="erpnext-input qi-control qi-qty-input"
                            value={rd.value || ''}
                            onChange={e => updateReading(idx, 'value', e.target.value)}
                            placeholder="Count"
                            disabled={selected.status !== 'pending'}
                            aria-label={`Actual reading for ${rd.specification || 'spec'}`}
                          />
                        </div>
                      </td>
                      <td>{statusBadge(rd.status || 'pending')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selected.status === 'pending' && (
              <button type="button" className="erpnext-btn-secondary text-xs mt-3" disabled={readingsBusy} onClick={() => { void saveReadings() }}>
                {readingsBusy ? 'Saving…' : 'Save readings'}
              </button>
            )}
          </div>

          {selected.status === 'pending' && (
            <div className="qi-result-row">
              <div className="qi-field qi-field-wide">
                <label className="erpnext-label qi-label">Reject reason</label>
                <div className="qi-field-box">
                  <input className="erpnext-input qi-control" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Required when rejecting" />
                </div>
              </div>
              <div className="qi-result-actions">
                <button type="button" className="erpnext-btn-primary qi-head-btn" style={{ background: 'var(--green)' }} onClick={() => void acceptInspection()}>Accept</button>
                <button type="button" className="erpnext-btn-primary qi-head-btn" style={{ background: 'var(--red)' }} onClick={() => void rejectInspection()}>Reject</button>
              </div>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <Comments entityType="quality_inspection" entityId={selected.id} />
          </div>
        </div>
      )}

      <div className="erpnext-card overflow-x-auto p-4 space-y-3">
        <div className="font-medium">Inspections</div>
        <ListPager pager={pager} placeholder="Search inspections, item, reference…" />
        <table className="erpnext-table text-sm">
          <thead>
            <tr style={{ background: 'var(--panel-2)' }}>
              <th>Inspection</th><th>Item</th><th>Reference</th><th>Qty</th><th>Sample</th><th>Status</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {pager.pageItems.map(q => (
              <tr
                key={q.id}
                onClick={() => openInspection(q.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openInspection(q.id) }
                }}
                tabIndex={0}
                style={{ cursor: 'pointer', background: selected?.id === q.id ? 'var(--panel-2)' : undefined }}
              >
                <td>
                  <button type="button" className="qi-open-btn" onClick={e => { e.stopPropagation(); openInspection(q.id) }}>{q.inspection_no}</button>
                </td>
                <td>{q.item_code}</td>
                <td>{q.reference_name || '—'}</td>
                <td>{fmtQty(q.qty)}</td>
                <td>{fmtQty(q.sample_size)}</td>
                <td>{statusBadge(q.status || 'pending')}</td>
                <td className="whitespace-nowrap">{fmtWhen(q.created_at)}</td>
              </tr>
            ))}
            {pager.total === 0 && (
              <tr><td colSpan={7} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No inspections yet. Scan an item and press Create inspection.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        .qi-head-btn { height: 40px; min-height: 40px; padding: 0 16px; font-size: 14px; font-weight: 600; border-radius: 6px; display: inline-flex; align-items: center; gap: 8px; }
        .qi-form-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(160px, 0.7fr); gap: 16px 20px; align-items: start; }
        .qi-meta-row { display: grid; grid-template-columns: minmax(0, 1.4fr) 112px 112px minmax(0, 1fr); gap: 16px; }
        .qi-field { min-width: 0; }
        .qi-field-wide { grid-column: span 1; }
        .qi-label { font-weight: 600; color: var(--text-color); font-size: 13px; margin-bottom: 6px; display: block; }
        .qi-field-box { position: relative; display: flex; align-items: stretch; height: 40px; min-width: 0; box-sizing: border-box; border: 1px solid var(--border, #d1d5db); border-radius: 6px; background: var(--card, #fff); }
        .qi-field-box:focus-within { border-color: var(--primary, #2563eb); box-shadow: 0 0 0 3px oklch(0.56 0.18 250 / 0.10); }
        .qi-control, .qi-select { appearance: none; -webkit-appearance: none; background: transparent !important; border: 0 !important; box-shadow: none !important; color: var(--text-color); box-sizing: border-box; height: 100%; width: 100%; min-width: 0; padding: 0 12px; font-size: 13px; font-weight: 500; }
        .qi-select { padding-right: 32px; }
        .qi-field-box:has(.qi-select)::after { content: ''; position: absolute; right: 14px; top: 50%; width: 6px; height: 6px; margin-top: -5px; border-right: 1.5px solid var(--text-dim, #6b7280); border-bottom: 1.5px solid var(--text-dim, #6b7280); transform: rotate(45deg); pointer-events: none; }
        .qi-scan-in-field { flex: 0 0 40px; width: 40px; border: 0; background: transparent; color: var(--text-dim); cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .qi-qty-box { width: 112px; }
        .qi-qty-input { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
        .qi-qty-input::placeholder { color: var(--text-dim); font-weight: 500; }
        .qi-qty-value { display: flex; align-items: center; justify-content: flex-end; width: 100%; padding: 0 12px; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
        .qi-hint { font-size: 11px; color: var(--text-dim); margin-top: 6px; line-height: 1.4; }
        .qi-field-actions { display: flex; flex-direction: column; align-items: flex-start; }
        .qi-field-actions .qi-head-btn { width: auto; }
        .qi-card-focus { box-shadow: 0 0 0 2px var(--primary, #2563eb); }
        .qi-items-wrap { overflow-x: auto; }
        .qi-open-btn { background: none; border: 0; padding: 0; color: var(--accent); font: inherit; font-weight: 600; cursor: pointer; }
        .qi-result-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: end; }
        .qi-result-actions { display: flex; gap: 8px; padding-bottom: 0; }
        @media (max-width: 900px) {
          .qi-form-grid, .qi-meta-row, .qi-result-row { grid-template-columns: minmax(0, 1fr); }
          .qi-qty-box { width: 100%; }
        }
      `}</style>
    </div>
  )
}
