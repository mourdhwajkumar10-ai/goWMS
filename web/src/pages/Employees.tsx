import { useEffect, useState } from 'react'
import { api, getRole } from '../services/api'
import { notify } from '../components/Notifications'
import CSVImport from '../components/CSVTools'

export default function Employees() {
  const myRole = (getRole() || '').toLowerCase()
  const canManage = myRole === 'admin' || myRole === 'wm' || myRole === 'supervisor'

  const [list, setList] = useState<any[]>([])
  const [roles, setRoles] = useState<{ code: string; name: string }[]>([])
  const [rolesLoaded, setRolesLoaded] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [previewId, setPreviewId] = useState('')
  const [badge, setBadge] = useState('')
  const [role, setRole] = useState('')
  const [pin, setPin] = useState('')
  const [dept, setDept] = useState('')
  const [seeding, setSeeding] = useState(false)

  const load = async () => {
    api.employeeList().then(r => { if (r.ok) setList(r.data ?? []) })
    const r = await api.rolesList()
    setRolesLoaded(true)
    if (r.ok && r.data?.length) {
      const opts = r.data.map((x: any) => ({ code: x.code, name: x.name }))
      setRoles(opts)
      setRole(prev => prev || opts.find(o => o.code === 'picker')?.code || opts[0].code)
    } else {
      setRoles([])
    }
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!firstName && !lastName) {
      setPreviewId('')
      return
    }
    const t = setTimeout(() => {
      api.employeeNextId(firstName, lastName).then(r => {
        if (r.ok) setPreviewId(r.data?.employee_number || '')
        else setPreviewId('')
      })
    }, 250)
    return () => clearTimeout(t)
  }, [firstName, lastName])

  const seedDefaults = async () => {
    setSeeding(true)
    const res = await api.rolesSeedDefaults()
    setSeeding(false)
    if (res.ok) {
      notify({ type: 'success', title: 'Roles seeded', message: 'Same list as Roles page' })
      await load()
    } else {
      notify({ type: 'error', title: 'Seed failed', message: res.error || 'Apply migrations 011+012' })
    }
  }

  const create = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      notify({ type: 'error', title: 'Name required', message: 'First and last name required' })
      return
    }
    if (!role) {
      notify({ type: 'error', title: 'Role required', message: 'Seed roles first' })
      return
    }
    const r = await api.employeeCreate({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      employee_name: `${firstName.trim()} ${lastName.trim()}`,
      badge_code: badge || undefined,
      wms_role: role,
      department: dept || undefined,
      pin: pin || undefined,
    })
    if (r.ok) {
      notify({
        type: 'success',
        title: 'Employee created',
        message: `${r.data?.employee_name || ''} · ${r.data?.employee_number || previewId}`,
      })
      setShowNew(false)
      setFirstName(''); setLastName(''); setPreviewId(''); setBadge(''); setPin(''); setDept('')
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
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Employees</h2>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            Employee ID auto: first4 + last4 + 01/02… Roles come from the Roles page only.
          </p>
        </div>
        <div className="flex gap-2">
          <CSVImport onImport={async (rows) => {
            const r = await api.employeeImport({ rows })
            if (r.ok) {
              notify({ type: 'success', title: 'Employees imported', message: `created ${r.data?.created ?? 0}, skipped ${r.data?.skipped ?? 0}` })
              load()
            } else notify({ type: 'error', title: 'Import failed', message: r.error || '' })
          }} />
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

      {rolesLoaded && roles.length === 0 && (
        <div className="erpnext-card p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            No roles yet — same as Roles page. Seed defaults (migrations 011+012) before assigning.
          </p>
          <button className="erpnext-btn-secondary" disabled={seeding} onClick={seedDefaults}>
            {seeding ? 'Seeding…' : 'Seed default roles'}
          </button>
        </div>
      )}

      {showNew && (
        <div className="erpnext-card p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className="erpnext-label">First name *</label><input className="erpnext-input" value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
            <div><label className="erpnext-label">Last name *</label><input className="erpnext-input" value={lastName} onChange={e => setLastName(e.target.value)} /></div>
            <div>
              <label className="erpnext-label">Employee ID (auto)</label>
              <input className="erpnext-input" value={previewId || '—'} readOnly disabled />
            </div>
            <div><label className="erpnext-label">Badge Code</label><input className="erpnext-input" value={badge} onChange={e => setBadge(e.target.value)} /></div>
            <div>
              <label className="erpnext-label">WMS Role</label>
              <select className="erpnext-input" value={role} onChange={e => setRole(e.target.value)} disabled={roles.length === 0}>
                {roles.length === 0 && <option value="">No roles</option>}
                {roles.map(r => <option key={r.code} value={r.code}>{r.name} ({r.code})</option>)}
              </select>
            </div>
            <div><label className="erpnext-label">Department</label><input className="erpnext-input" value={dept} onChange={e => setDept(e.target.value)} /></div>
            <div><label className="erpnext-label">PIN (optional)</label><input className="erpnext-input" value={pin} onChange={e => setPin(e.target.value)} type="password" /></div>
          </div>
          <div className="flex justify-end"><button className="erpnext-btn-primary" onClick={create} disabled={roles.length === 0}>Create</button></div>
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
                    value={e.wms_role || role || ''}
                    onChange={ev => assignRole(e.id, ev.target.value)}
                    disabled={roles.length === 0}
                  >
                    {roles.length === 0 && <option value={e.wms_role || ''}>{e.wms_role || '—'}</option>}
                    {e.wms_role && !roles.some(r => r.code === e.wms_role) && (
                      <option value={e.wms_role}>{e.wms_role} (not in roles)</option>
                    )}
                    {roles.map(r => <option key={r.code} value={r.code}>{r.code}</option>)}
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
