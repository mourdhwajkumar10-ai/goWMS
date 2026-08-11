import { useEffect, useState } from 'react'
import { api, getRole } from '../services/api'
import { notify } from '../components/Notifications'

export default function Employees() {
  const myRole = (getRole() || '').toLowerCase()
  const canManage = myRole === 'admin' || myRole === 'wm' || myRole === 'supervisor'

  const [list, setList] = useState<any[]>([])
  const [roles, setRoles] = useState<{ code: string; name: string }[]>([])
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [badge, setBadge] = useState('')
  const [role, setRole] = useState('picker')
  const [pin, setPin] = useState('')
  const [dept, setDept] = useState('')

  const load = () => {
    api.employeeList().then(r => { if (r.ok) setList(r.data ?? []) })
    api.rolesList().then(r => {
      if (r.ok && r.data?.length) {
        setRoles(r.data.map((x: any) => ({ code: x.code, name: x.name })))
      }
    })
  }
  useEffect(() => { load() }, [])

  const roleOptions = roles.length
    ? roles
    : ['admin','supervisor','picker','packer','qi','dispatcher','wm','driver','billing'].map(c => ({ code: c, name: c }))

  const create = async () => {
    if (!name) return
    const r = await api.employeeCreate({
      employee_name: name,
      employee_number: number || undefined,
      badge_code: badge || undefined,
      wms_role: role,
      department: dept || undefined,
      pin: pin || undefined,
    })
    if (r.ok) {
      notify({ type: 'success', title: 'Employee created', message: name })
      setShowNew(false)
      setName(''); setNumber(''); setBadge(''); setPin(''); setDept('')
      load()
    } else {
      notify({ type: 'error', title: 'Failed', message: r.error || '' })
    }
  }

  const setEmpPin = async (id: number) => {
    const p = window.prompt('New PIN (4-8 digits)')
    if (!p) return
    const r = await api.employeeSetPin(id, p)
    if (r.ok) notify({ type: 'success', title: 'PIN set', message: 'Token version bumped' })
    else notify({ type: 'error', title: 'PIN failed', message: r.error || '' })
    load()
  }

  const assignRole = async (id: number, wms_role: string) => {
    const r = await api.employeeAssignRole(id, wms_role)
    if (r.ok) notify({ type: 'success', title: 'Role updated', message: wms_role })
    else notify({ type: 'error', title: 'Role failed', message: r.error || '' })
    load()
  }

  if (!canManage) {
    return (
      <div className="erpnext-card p-6">
        <h2 className="text-lg font-semibold">Employees</h2>
        <p className="text-sm mt-2" style={{ color: 'var(--text-dim)' }}>Admin access required to manage employees and assign roles.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Employees</h2>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            PIN login · badge · assign WMS role (JWT <code>role</code> claim). Configure permissions on Roles page.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            className="erpnext-btn-secondary"
            href={api.employeesExportUrl()}
            onClick={(e) => {
              e.preventDefault()
              const token = localStorage.getItem('gowms_token')
              fetch(api.employeesExportUrl(), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
                .then(r => r.text())
                .then(text => {
                  const blob = new Blob([text], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = 'employees.csv'; a.click()
                  URL.revokeObjectURL(url)
                })
            }}
          >Export CSV</a>
          <button className="erpnext-btn-primary" onClick={() => setShowNew(!showNew)}>{showNew ? 'Cancel' : '+ New'}</button>
        </div>
      </div>

      {showNew && (
        <div className="erpnext-card p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className="erpnext-label">Name *</label><input className="erpnext-input" value={name} onChange={e => setName(e.target.value)} /></div>
            <div><label className="erpnext-label">Employee No</label><input className="erpnext-input" value={number} onChange={e => setNumber(e.target.value)} /></div>
            <div><label className="erpnext-label">Badge Code</label><input className="erpnext-input" value={badge} onChange={e => setBadge(e.target.value)} /></div>
            <div>
              <label className="erpnext-label">WMS Role</label>
              <select className="erpnext-input" value={role} onChange={e => setRole(e.target.value)}>
                {roleOptions.map(r => <option key={r.code} value={r.code}>{r.name} ({r.code})</option>)}
              </select>
            </div>
            <div><label className="erpnext-label">Department</label><input className="erpnext-input" value={dept} onChange={e => setDept(e.target.value)} /></div>
            <div><label className="erpnext-label">PIN (optional)</label><input className="erpnext-input" value={pin} onChange={e => setPin(e.target.value)} type="password" /></div>
          </div>
          <div className="flex justify-end"><button className="erpnext-btn-primary" onClick={create}>Create</button></div>
        </div>
      )}

      <div className="erpnext-card">
        <table className="erpnext-table">
          <thead><tr><th>Name</th><th>No</th><th>Badge</th><th>Role</th><th>PIN</th><th></th></tr></thead>
          <tbody>
            {list.map((e: any) => (
              <tr key={e.id}>
                <td className="font-medium">{e.employee_name}</td>
                <td>{e.employee_number || '—'}</td>
                <td>{e.badge_code || '—'}</td>
                <td>
                  <select
                    className="erpnext-input text-sm"
                    style={{ minWidth: 140 }}
                    value={e.wms_role || 'picker'}
                    onChange={ev => assignRole(e.id, ev.target.value)}
                  >
                    {roleOptions.map(r => <option key={r.code} value={r.code}>{r.code}</option>)}
                  </select>
                </td>
                <td>{e.has_pin ? '✓' : '—'}</td>
                <td><button className="erpnext-btn-secondary text-xs" onClick={() => setEmpPin(e.id)}>Set PIN</button></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No employees</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
