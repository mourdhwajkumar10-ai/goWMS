import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Package, Plus, ScanLine, Search } from 'lucide-react'
import { api } from '../services/api'
import BarcodeScanner from '../components/BarcodeScanner'
import CameraScanner from '../components/CameraScanner'
import Comments from '../components/Comments'
import { notify } from '../components/Notifications'
import TruckAutocomplete from '../components/TruckAutocomplete'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'
import { useLoadMore } from '../hooks/useLoadMore'
import { useRfUi } from '../hooks/useRfUi'
import RfShell from '../components/RfShell'
import '../styles/scanner.css'

interface Trip {
  id: number
  trip_no: string
  vehicle_no: string | null
  driver_name: string | null
  status: string
  departure_time: string | null
  created_at: string
}

interface Stop {
  id: number
  delivery_note_no: string
  customer: string
  address: string
  stop_order: number
  visited: boolean
}

export default function Dispatch() {
  const rf = useRfUi()
  const [trips, setTrips] = useState<Trip[]>([])
  const [selectedTrip, setSelectedTrip] = useState<any>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [msg, setMsg] = useState('')
  const [rfQuery, setRfQuery] = useState('')
  const [showNew, setShowNew] = useState(false)

  const [vehicle, setVehicle] = useState('')
  const [driverName, setDriverName] = useState('')
  const [carrierId, setCarrierId] = useState('')
  const [carriers, setCarriers] = useState<any[]>([])
  const [loadBoxId, setLoadBoxId] = useState('')
  const [dnCustomer, setDnCustomer] = useState('')
  const [podSig, setPodSig] = useState('')

  const loadTrips = () => api.dispatchTrips().then(r => { if (r.ok) setTrips(r.data ?? []) })
  useEffect(() => {
    loadTrips()
    api.carriersList().then(r => { if (r.ok) setCarriers(r.data ?? []) })
  }, [])
  const pager = useClientPager(trips)

  const createTrip = async () => {
    const r = await api.dispatchCreate({
      vehicle_no: vehicle,
      driver_name: driverName,
      carrier_id: carrierId ? +carrierId : undefined,
    })
    if (r.ok) {
      setMsg(`Trip ${r.data.trip_no} created`)
      setVehicle(''); setDriverName(''); setCarrierId('')
      loadTrips()
      notify({ type: 'success', title: 'Trip Created', message: r.data.trip_no })
    }
  }

  const openTrip = async (id: number) => {
    const r = await api.get(`/dispatch/trip/${id}`)
    if (r.ok) setSelectedTrip(r.data)
  }

  const handleScan = (code: string) => {
    setShowScanner(false)
    setLoadBoxId(code)
  }

  const loadBox = async () => {
    if (!loadBoxId || !selectedTrip) return
    const r = await api.post<{ stock_consumed?: boolean }>(`/dispatch/trip/${selectedTrip.id}/load`, { label: loadBoxId })
    if (r.ok) {
      notify({
        type: 'success',
        title: 'Box Loaded',
        message: r.data?.stock_consumed
          ? `Box ${loadBoxId} loaded — reserved stock consumed`
          : `Box ${loadBoxId} loaded`,
      })
      setLoadBoxId('')
      openTrip(selectedTrip.id)
    } else {
      notify({ type: 'error', title: 'Load failed', message: r.error || 'Could not load box' })
    }
  }

  const startTrip = async (id: number) => {
    const r = await api.post(`/dispatch/trip/${id}/start`, {})
    if (r.ok) {
      notify({ type: 'success', title: 'Trip Started', message: 'Vehicle departed' })
      loadTrips()
      if (selectedTrip?.id === id) openTrip(id)
    }
  }

  const completeTrip = async (id: number) => {
    const r = await api.post<{ delivery_notes?: { delivery_note?: string }[] }>(`/dispatch/trip/${id}/complete`, {})
    if (r.ok) {
      const dns = r.data?.delivery_notes?.map(d => d.delivery_note).filter(Boolean) || []
      notify({
        type: 'success',
        title: 'Trip Completed',
        message: dns.length ? `DNs: ${dns.join(', ')}` : 'All stops delivered',
      })
      loadTrips()
      setSelectedTrip(null)
    }
  }

  const completeGated = async (id: number) => {
    const r = await api.dispatchCompleteGated(id)
    if (r.ok) {
      const dns = (r.data as any)?.delivery_notes?.map((d: any) => d.delivery_note).filter(Boolean) || []
      notify({
        type: 'success',
        title: 'Trip Completed (gated)',
        message: dns.length ? `DNs: ${dns.join(', ')}` : 'All stops visited',
      })
      loadTrips(); setSelectedTrip(null)
    } else {
      notify({ type: 'error', title: 'Complete blocked', message: r.error || '' })
    }
  }

  const generateDN = async () => {
    if (!selectedTrip) return
    const r = await api.dispatchGenerateDN(selectedTrip.id, {
      customer: dnCustomer || undefined,
      create_stop: true,
    })
    if (r.ok) {
      notify({ type: 'success', title: 'DN Created', message: r.data.delivery_note })
      setDnCustomer('')
      openTrip(selectedTrip.id)
    } else notify({ type: 'error', title: 'DN failed', message: r.error || '' })
  }

  const visitWithPOD = async (stopId: number) => {
    if (!selectedTrip) return
    const r = await api.dispatchVisitStop(selectedTrip.id, stopId, {
      signature_data: podSig || `signed-at-${new Date().toISOString()}`,
    })
    if (r.ok) {
      notify({ type: 'success', title: 'POD captured', message: 'Stop visited' })
      setPodSig('')
      openTrip(selectedTrip.id)
    } else notify({ type: 'error', title: 'POD failed', message: r.error || '' })
  }

  const statusBadge = (status: string) => {
    const cls = status === 'completed' ? 'erpnext-badge-green' :
                status === 'in_transit' ? 'erpnext-badge-blue' :
                status === 'scheduled' ? 'erpnext-badge-yellow' :
                'erpnext-badge-red'
    return <span className={`erpnext-badge ${cls}`}>{status}</span>
  }

  const rfTrips = pager.filtered.filter(t => {
    const q = rfQuery.trim().toLowerCase()
    if (!q) return true
    return `${t.trip_no} ${t.vehicle_no || ''} ${t.driver_name || ''} ${t.status}`.toLowerCase().includes(q)
  })
  const rfTripMore = useLoadMore(rfTrips, 10, `${rfQuery}|${rfTrips.length}`)

  const loadedBoxCount = selectedTrip ? (selectedTrip.boxes || []).filter((b: any) => b.loaded).length : 0
  const totalBoxCount = selectedTrip ? (selectedTrip.boxes || []).length : 0
  const tripStat = selectedTrip
    ? totalBoxCount > 0 ? String(loadedBoxCount) : ''
    : String(trips.filter(t => t.status === 'completed').length)
  const tripStatOf = selectedTrip
    ? totalBoxCount > 0 ? `/ ${totalBoxCount}` : undefined
    : undefined

  if (rf) {
    return (
      <RfShell
        title="Dispatch"
        stat={tripStat}
        statOf={tripStatOf}
        meta={selectedTrip ? selectedTrip.trip_no : undefined}
        onBack={selectedTrip ? () => setSelectedTrip(null) : undefined}
      >
        {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

        {!selectedTrip ? (
          <>
            <div className="scan-bottom-bar">
              <div className="scan-input-chip">
                <Search size={16} strokeWidth={1.8} />
                <input
                  type="search"
                  value={rfQuery}
                  onChange={e => setRfQuery(e.target.value)}
                  placeholder="Search trips…"
                  autoComplete="off"
                />
              </div>
              <button
                type="button"
                className="scan-icon-btn primary"
                onClick={() => setShowNew(!showNew)}
                aria-label="New trip"
              >
                <Plus size={18} strokeWidth={1.8} />
              </button>
            </div>

            {showNew && (
              <div className="scan-section-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="scan-section-title">Create trip</div>
                <TruckAutocomplete
                  value={vehicle}
                  onChangeText={setVehicle}
                  onSelect={row => {
                    setVehicle(row.truck_no)
                    if (row.driver_name && !driverName) setDriverName(row.driver_name)
                  }}
                  placeholder="Vehicle no"
                />
                <input className="scan-text-input" value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Driver name" />
                <select className="scan-text-input" value={carrierId} onChange={e => setCarrierId(e.target.value)}>
                  <option value="">No carrier</option>
                  {carriers.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}{c.carrier_code ? ` (${c.carrier_code})` : ''}</option>
                  ))}
                </select>
                <button type="button" className="scan-btn scan-btn-primary" onClick={() => { void createTrip(); setShowNew(false) }}>Create trip</button>
                <button type="button" className="scan-btn scan-btn-outline" onClick={() => setShowNew(false)}>Cancel</button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rfTripMore.visible.map(t => (
                <button
                  key={t.id}
                  type="button"
                  className="scan-select-card"
                  onClick={() => openTrip(t.id)}
                  style={{ textAlign: 'left', width: '100%', cursor: 'pointer' }}
                >
                  <div className="scan-select-card-title">{t.trip_no}</div>
                  <div className="scan-select-card-sub">{t.vehicle_no || 'No vehicle'} · {t.driver_name || '—'}</div>
                  <div className="scan-select-card-meta">
                    <span>{t.status}</span>
                    <span style={{ color: 'var(--primary)' }}>Open →</span>
                  </div>
                </button>
              ))}
              {rfTripMore.hasMore && (
                <button type="button" className="scan-btn scan-btn-outline" onClick={rfTripMore.loadMore}>
                  Load more ({rfTripMore.remaining} left)
                </button>
              )}
              {rfTrips.length === 0 && (
                <div className="scan-section-card" style={{ textAlign: 'center' }}>
                  <p style={{ fontWeight: 600, marginBottom: 6, color: 'var(--foreground)' }}>No trips yet</p>
                  <button type="button" className="scan-btn scan-btn-primary" onClick={() => setShowNew(true)}>
                    <Plus size={16} /> New trip
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="scan-section-card">
              <div className="scan-select-card-title">{selectedTrip.trip_no}</div>
              <div className="scan-select-card-sub">
                {selectedTrip.vehicle_no || '—'} · {selectedTrip.driver_name || 'No driver'} · {selectedTrip.status}
              </div>
            </div>

            {(selectedTrip.status === 'draft' || selectedTrip.status === 'scheduled') && (
              <>
                <div className="scan-live-viewport" style={{ borderRadius: 12, overflow: 'hidden', minHeight: 180 }}>
                  <CameraScanner
                    open
                    embedded
                    minimal
                    continuous
                    onClose={() => {}}
                    onScan={(code) => {
                      const clean = String(code || '').trim()
                      if (!clean) return
                      setLoadBoxId(clean)
                    }}
                  />
                </div>

                <div className="scan-bottom-bar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                  <div className="scan-input-chip">
                    <Package size={16} strokeWidth={1.8} />
                    <input
                      value={loadBoxId}
                      onChange={e => setLoadBoxId(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void loadBox() } }}
                      placeholder="Scan box label…"
                      autoComplete="off"
                    />
                    <button type="button" className="scan-icon-btn" style={{ width: 36, height: 36 }} onClick={() => setShowScanner(true)} aria-label="Scan box">
                      <ScanLine size={16} />
                    </button>
                  </div>
                  <button type="button" className="scan-btn scan-btn-primary" onClick={() => void loadBox()}>Load box</button>
                </div>
              </>
            )}

            {(selectedTrip.status === 'draft' || selectedTrip.status === 'scheduled') && (
              <button
                type="button"
                className="scan-btn"
                disabled={loadedBoxCount === 0}
                onClick={() => void startTrip(selectedTrip.id)}
                style={{
                  opacity: loadedBoxCount === 0 ? 0.4 : 1,
                  pointerEvents: loadedBoxCount === 0 ? 'none' : 'auto',
                  background: 'var(--primary)',
                  color: '#fff',
                  cursor: loadedBoxCount === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Start trip {loadedBoxCount === 0 ? '(load boxes first)' : ''}
              </button>
            )}
            {selectedTrip.status === 'in_transit' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button type="button" className="scan-btn scan-btn-primary" onClick={() => void completeTrip(selectedTrip.id)}>Complete</button>
                <button type="button" className="scan-btn scan-btn-outline" onClick={() => void completeGated(selectedTrip.id)}>Complete (gated)</button>
              </div>
            )}

            {(selectedTrip.status === 'draft' || selectedTrip.status === 'scheduled' || selectedTrip.status === 'in_transit') && (
              <div className="scan-section-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="scan-section-title">Generate DN + stop</div>
                <input className="scan-text-input" value={dnCustomer} onChange={e => setDnCustomer(e.target.value)} placeholder="Customer" />
                <button type="button" className="scan-btn scan-btn-outline" onClick={() => void generateDN()}>Generate DN</button>
              </div>
            )}

            {(selectedTrip.boxes || []).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="scan-section-title">Loaded boxes ({selectedTrip.boxes.length})</div>
                {selectedTrip.boxes.map((b: any) => (
                  <div key={b.id} className="scan-row">
                    <div className={`scan-row-check${b.loaded ? ' done' : ''}`}>{b.loaded ? '✓' : ''}</div>
                    <div className="scan-row-info">
                      <div className="scan-row-code">{b.label}</div>
                      <div className="scan-row-desc">{b.delivery_note || '—'}</div>
                    </div>
                    <div className="scan-row-meta">
                      <div className="scan-row-label">{b.loaded ? 'loaded' : 'pending'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(selectedTrip.stops || []).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="scan-section-title">Stops + POD</div>
                <input
                  className="scan-text-input"
                  value={podSig}
                  onChange={e => setPodSig(e.target.value)}
                  placeholder="Signature / POD note"
                />
                {selectedTrip.stops.map((s: Stop) => (
                  <div key={s.id} className="scan-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <div className={`scan-row-check${s.visited ? ' done' : ''}`}>{s.visited ? '✓' : s.stop_order}</div>
                    <div className="scan-row-info" style={{ flex: 1 }}>
                      <div className="scan-row-code">{s.delivery_note_no}</div>
                      <div className="scan-row-desc">{s.customer} · {s.address || '—'}</div>
                    </div>
                    <div className="scan-row-meta">
                      <div className="scan-row-label">{s.visited ? 'delivered' : 'pending'}</div>
                    </div>
                    {!s.visited && (
                      <button
                        type="button"
                        className="scan-btn scan-btn-primary scan-btn-sm"
                        style={{ width: '100%' }}
                        onClick={() => void visitWithPOD(s.id)}
                      >
                        POD + Visit
                      </button>
                    )}
                  </div>
                ))}
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
        <h2 className="text-lg font-semibold">Dispatch</h2>
        <button onClick={() => setShowScanner(true)} className="erpnext-btn-secondary">📷 Scan Box</button>
      </div>

      {!selectedTrip ? (
        <>
          <div className="erpnext-card">
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-semibold">Create Trip</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                Same Transport master as inbound GRN — <Link to="/transports" style={{ color: 'var(--accent)' }}>manage trucks</Link>
              </p>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="erpnext-label">Vehicle No *</label>
                  <TruckAutocomplete
                    value={vehicle}
                    onChangeText={setVehicle}
                    onSelect={row => {
                      setVehicle(row.truck_no)
                      if (row.driver_name && !driverName) setDriverName(row.driver_name)
                    }}
                    placeholder="Type truck no or name"
                  />
                </div>
                <div>
                  <label className="erpnext-label">Driver Name</label>
                  <input className="erpnext-input" value={driverName} onChange={e => setDriverName(e.target.value)} />
                </div>
                <div>
                  <label className="erpnext-label">Carrier</label>
                  <select className="erpnext-input" value={carrierId} onChange={e => setCarrierId(e.target.value)}>
                    <option value="">— none —</option>
                    {carriers.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}{c.carrier_code ? ` (${c.carrier_code})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button onClick={createTrip} className="erpnext-btn-primary">Create Trip</button>
                </div>
              </div>
            </div>
          </div>

          {msg && (
            <div style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', color: 'var(--green)', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
              {msg}
            </div>
          )}

          <div className="erpnext-card">
            <div className="px-4 py-3 space-y-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-semibold">Trips</h3>
              <ListPager pager={pager} placeholder="Search trips…" />
            </div>
            <div className="table-wrap">
              <table className="erpnext-table">
                <thead>
                  <tr><th>Trip No</th><th>Vehicle</th><th>Driver</th><th>Status</th><th>Created</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {pager.pageItems.map(t => (
                    <tr key={t.id}>
                      <td className="font-medium cursor-pointer hover:underline" style={{ color: 'var(--accent)' }} onClick={() => openTrip(t.id)}>{t.trip_no}</td>
                      <td>{t.vehicle_no || '—'}</td>
                      <td>{t.driver_name || '—'}</td>
                      <td>{statusBadge(t.status)}</td>
                      <td>{new Date(t.created_at).toLocaleDateString()}</td>
                      <td>
                        <div className="flex gap-1">
                          <button onClick={() => openTrip(t.id)} className="erpnext-btn-secondary text-xs">Open</button>
                          {t.status === 'draft' && (
                            <button onClick={() => startTrip(t.id)} className="erpnext-btn-primary text-xs">Start</button>
                          )}
                          {t.status === 'in_transit' && (
                            <button onClick={() => completeTrip(t.id)} className="erpnext-btn-primary text-xs">Complete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pager.total === 0 && <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No trips</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="erpnext-card">
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h3 className="font-semibold">{selectedTrip.trip_no}</h3>
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                Vehicle: {selectedTrip.vehicle_no || '—'} | Driver: {selectedTrip.driver_name || '—'}
              </p>
            </div>
            <div className="flex gap-2">
              {selectedTrip.status === 'draft' || selectedTrip.status === 'scheduled' ? (
                <button onClick={() => startTrip(selectedTrip.id)} className="erpnext-btn-primary text-sm">Start Trip</button>
              ) : null}
              {selectedTrip.status === 'in_transit' && (
                <>
                  <button onClick={() => completeTrip(selectedTrip.id)} className="erpnext-btn-primary text-sm">Complete</button>
                  <button onClick={() => completeGated(selectedTrip.id)} className="erpnext-btn-secondary text-sm">Complete (gated)</button>
                </>
              )}
              <button onClick={() => setSelectedTrip(null)} className="erpnext-btn-secondary">Back</button>
            </div>
          </div>

          <div className="p-4">
            <h4 className="font-medium text-sm mb-2">Auto-generate Delivery Note</h4>
            <div className="flex gap-2 mb-4">
              <input className="erpnext-input" value={dnCustomer} onChange={e => setDnCustomer(e.target.value)} placeholder="Customer" />
              <button onClick={generateDN} className="erpnext-btn-primary">Generate DN + Stop</button>
            </div>

            <h4 className="font-medium text-sm mb-2">Load Box</h4>
            <div className="flex gap-2">
              <input className="erpnext-input" value={loadBoxId} onChange={e => setLoadBoxId(e.target.value)} placeholder="Box ID" />
              <button onClick={() => setShowScanner(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>📷</button>
              <button onClick={loadBox} className="erpnext-btn-primary">Load</button>
            </div>

            {selectedTrip.boxes && selectedTrip.boxes.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-sm mb-2">Loaded Boxes ({selectedTrip.boxes.length})</h4>
                <div className="table-wrap">
                  <table className="erpnext-table text-sm">
                    <thead>
                      <tr><th>Box</th><th>Delivery Note</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {selectedTrip.boxes.map((b: any) => (
                        <tr key={b.id}>
                          <td className="font-medium">{b.label}</td>
                          <td>{b.delivery_note || '—'}</td>
                          <td>{statusBadge(b.loaded ? 'loaded' : 'pending')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedTrip.stops && selectedTrip.stops.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-sm mb-2">Delivery Stops + POD</h4>
                <div className="mb-2">
                  <label className="erpnext-label">Signature / POD note</label>
                  <input className="erpnext-input" value={podSig} onChange={e => setPodSig(e.target.value)} placeholder="Recipient name or signature data" />
                </div>
                <div className="table-wrap">
                  <table className="erpnext-table text-sm">
                    <thead>
                      <tr><th>#</th><th>Delivery Note</th><th>Customer</th><th>Address</th><th>Status</th><th></th></tr>
                    </thead>
                    <tbody>
                      {selectedTrip.stops.map((s: Stop) => (
                        <tr key={s.id}>
                          <td>{s.stop_order}</td>
                          <td className="font-medium">{s.delivery_note_no}</td>
                          <td>{s.customer}</td>
                          <td>{s.address || '—'}</td>
                          <td>
                            <span className={`erpnext-badge ${s.visited ? 'erpnext-badge-green' : 'erpnext-badge-yellow'}`}>
                              {s.visited ? 'delivered' : 'pending'}
                            </span>
                          </td>
                          <td>
                            {!s.visited && (
                              <button className="erpnext-btn-primary text-xs" onClick={() => visitWithPOD(s.id)}>POD + Visit</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
            <Comments entityType="delivery_trip" entityId={selectedTrip.id} />
          </div>
        </div>
      )}
    </div>
  )
}
