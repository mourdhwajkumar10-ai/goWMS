import { useEffect, useState } from 'react'
import { api } from '../services/api'
import BarcodeScanner from '../components/BarcodeScanner'
import Comments from '../components/Comments'
import { notify } from '../components/Notifications'

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
  const [trips, setTrips] = useState<Trip[]>([])
  const [selectedTrip, setSelectedTrip] = useState<any>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [msg, setMsg] = useState('')

  const [vehicle, setVehicle] = useState('')
  const [driverName, setDriverName] = useState('')
  const [loadBoxId, setLoadBoxId] = useState('')

  const loadTrips = () => api.dispatchTrips().then(r => { if (r.ok) setTrips(r.data ?? []) })
  useEffect(() => { loadTrips() }, [])

  const createTrip = async () => {
    const r = await api.dispatchCreate({
      vehicle_no: vehicle,
      driver_name: driverName,
    })
    if (r.ok) {
      setMsg(`Trip ${r.data.trip_no} created`)
      setVehicle(''); setDriverName('')
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
    const r = await api.post<{ stock_consumed?: boolean }>(`/dispatch/trip/${selectedTrip.id}/load`, { box_id: +loadBoxId })
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
    }
  }

  const completeTrip = async (id: number) => {
    const r = await api.post(`/dispatch/trip/${id}/complete`, {})
    if (r.ok) {
      notify({ type: 'success', title: 'Trip Completed', message: 'All stops delivered' })
      loadTrips()
    }
  }

  const statusBadge = (status: string) => {
    const cls = status === 'completed' ? 'erpnext-badge-green' :
                status === 'in_transit' ? 'erpnext-badge-blue' :
                status === 'scheduled' ? 'erpnext-badge-yellow' :
                'erpnext-badge-red'
    return <span className={`erpnext-badge ${cls}`}>{status}</span>
  }

  return (
    <div className="space-y-6">
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
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="erpnext-label">Vehicle No *</label>
                  <input className="erpnext-input" value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="MH-12-AB-1234" />
                </div>
                <div>
                  <label className="erpnext-label">Driver Name</label>
                  <input className="erpnext-input" value={driverName} onChange={e => setDriverName(e.target.value)} />
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
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-semibold">Trips</h3>
            </div>
            <table className="erpnext-table">
              <thead>
                <tr><th>Trip No</th><th>Vehicle</th><th>Driver</th><th>Status</th><th>Created</th><th>Action</th></tr>
              </thead>
              <tbody>
                {trips.map(t => (
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
                {trips.length === 0 && <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No trips</td></tr>}
              </tbody>
            </table>
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
              {selectedTrip.status === 'draft' && (
                <button onClick={() => startTrip(selectedTrip.id)} className="erpnext-btn-primary text-sm">Start Trip</button>
              )}
              {selectedTrip.status === 'in_transit' && (
                <button onClick={() => completeTrip(selectedTrip.id)} className="erpnext-btn-primary text-sm">Complete</button>
              )}
              <button onClick={() => setSelectedTrip(null)} className="erpnext-btn-secondary">Back</button>
            </div>
          </div>

          <div className="p-4">
            <h4 className="font-medium text-sm mb-2">Load Box</h4>
            <div className="flex gap-2">
              <input className="erpnext-input" value={loadBoxId} onChange={e => setLoadBoxId(e.target.value)} placeholder="Box ID" />
              <button onClick={() => setShowScanner(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>📷</button>
              <button onClick={loadBox} className="erpnext-btn-primary">Load</button>
            </div>

            {selectedTrip.boxes && selectedTrip.boxes.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-sm mb-2">Loaded Boxes ({selectedTrip.boxes.length})</h4>
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
            )}

            {selectedTrip.stops && selectedTrip.stops.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-sm mb-2">Delivery Stops</h4>
                <table className="erpnext-table text-sm">
                  <thead>
                    <tr><th>#</th><th>Delivery Note</th><th>Customer</th><th>Address</th><th>Status</th></tr>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
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
