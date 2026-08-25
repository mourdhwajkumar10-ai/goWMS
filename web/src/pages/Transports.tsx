import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import TruckAutocomplete from '../components/TruckAutocomplete'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'

type Transport = {
  id: number
  truck_no: string
  name: string
  transporter: string
  driver_name: string
  driver_phone: string
  notes: string
  disabled?: boolean
}

const emptyForm = {
  truck_no: '',
  name: '',
  transporter: '',
  driver_name: '',
  driver_phone: '',
  notes: '',
}

export default function Transports() {
  const [list, setList] = useState<Transport[]>([])
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const load = () => api.transportsList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => { load() }, [])
  const pager = useClientPager(list)

  const save = async () => {
    if (!form.truck_no.trim()) {
      notify({ type: 'warning', title: 'Truck number required', message: 'Enter the vehicle registration / truck no' })
      return
    }
    const r = await api.transportCreate(form)
    if (r.ok) {
      notify({ type: 'success', title: 'Transport saved', message: form.truck_no })
      setForm(emptyForm)
      setShowNew(false)
      load()
    } else {
      notify({ type: 'error', title: 'Could not save', message: r.error || '' })
    }
  }

  return (
    <div className="desk-page space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Transport</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
            Truck master for inbound GRN and outbound dispatch. Type a truck number or name to reuse a saved vehicle.
          </p>
        </div>
        <button className="erpnext-btn-primary" onClick={() => setShowNew(!showNew)}>
          {showNew ? '✕ Cancel' : '+ Add truck'}
        </button>
      </div>

      {showNew && (
        <div className="erpnext-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Add truck</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="erpnext-label">Truck no *</label>
              <TruckAutocomplete
                value={form.truck_no}
                onChangeText={v => setForm(f => ({ ...f, truck_no: v }))}
                onSelect={row => setForm(f => ({
                  ...f,
                  truck_no: row.truck_no,
                  name: f.name || row.name || '',
                  transporter: f.transporter || row.transporter || '',
                  driver_name: f.driver_name || row.driver_name || '',
                  driver_phone: f.driver_phone || row.driver_phone || '',
                }))}
                placeholder="MH-12-AB-1234"
              />
            </div>
            <div>
              <label className="erpnext-label">Truck name</label>
              <TruckAutocomplete
                matchField="name"
                value={form.name}
                onChangeText={v => setForm(f => ({ ...f, name: v }))}
                onSelect={row => setForm(f => ({
                  ...f,
                  name: row.name || '',
                  truck_no: f.truck_no || row.truck_no,
                  transporter: f.transporter || row.transporter || '',
                  driver_name: f.driver_name || row.driver_name || '',
                  driver_phone: f.driver_phone || row.driver_phone || '',
                }))}
                placeholder="e.g. Tata 407 dock 2"
              />
            </div>
            <div>
              <label className="erpnext-label">Transporter</label>
              <input className="erpnext-input" value={form.transporter} onChange={e => setForm(f => ({ ...f, transporter: e.target.value }))} placeholder="Carrier / transporter" />
            </div>
            <div>
              <label className="erpnext-label">Driver</label>
              <input className="erpnext-input" value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))} />
            </div>
            <div>
              <label className="erpnext-label">Driver phone</label>
              <input className="erpnext-input" value={form.driver_phone} onChange={e => setForm(f => ({ ...f, driver_phone: e.target.value }))} />
            </div>
            <div>
              <label className="erpnext-label">Notes</label>
              <input className="erpnext-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <button className="erpnext-btn-primary" onClick={save}>Save truck</button>
        </div>
      )}

      <div className="erpnext-card">
        <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <ListPager pager={pager} placeholder="Search truck no, name, transporter" />
        </div>
        <div className="overflow-x-auto">
          <table className="erpnext-table text-sm">
            <thead>
              <tr style={{ background: 'var(--panel-2)' }}>
                <th>Truck no</th>
                <th>Name</th>
                <th>Transporter</th>
                <th>Driver</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {pager.pageItems.map(t => (
                <tr key={t.id}>
                  <td className="font-medium">{t.truck_no}</td>
                  <td>{t.name || '—'}</td>
                  <td>{t.transporter || '—'}</td>
                  <td>{t.driver_name || '—'}</td>
                  <td>{t.driver_phone || '—'}</td>
                </tr>
              ))}
              {pager.total === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10" style={{ color: 'var(--text-dim)' }}>
                    No trucks yet. Add one, or create a GRN with a truck number.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
