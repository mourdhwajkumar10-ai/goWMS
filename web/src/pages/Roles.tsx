import { useEffect, useState } from 'react'
import { api, getRole } from '../services/api'
import { notify } from '../components/Notifications'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'

type AccessLevel = 'none' | 'view' | 'edit'
type AccessProfile = { inbound: AccessLevel; outbound: AccessLevel; admin: AccessLevel }

type Role = {
  id: number
  code: string
  name: string
  description: string
  is_system: boolean
  permissions: string[]
  access_profile?: AccessProfile
}

const LEVELS: AccessLevel[] = ['none', 'view', 'edit']
const emptyProfile = (): AccessProfile => ({ inbound: 'none', outbound: 'none', admin: 'none' })

export default function Roles() {
  const myRole = (getRole() || '').toLowerCase()
  const canManage = myRole === 'admin'

  const [roles, setRoles] = useState<Role[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [profile, setProfile] = useState<AccessProfile>(emptyProfile())
  const [showNew, setShowNew] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [seeding, setSeeding] = useState(false)

  const selected = roles.find(r => r.id === selectedId) || null

  const load = async () => {
    const r = await api.rolesList()
    if (r.ok) {
      const data: Role[] = r.data ?? []
      setRoles(data)
      if (selectedId == null && data.length > 0) {
        const first = data[0]
        setSelectedId(first.id)
        setProfile({ ...emptyProfile(), ...(first.access_profile || {}) })
      } else if (selectedId != null) {
        const cur = data.find(x => x.id === selectedId)
        if (cur) setProfile({ ...emptyProfile(), ...(cur.access_profile || {}) })
      }
    } else {
      setRoles([])
    }
  }

  useEffect(() => { load() }, [])

  const pager = useClientPager(roles)

  const selectRole = (r: Role) => {
    setSelectedId(r.id)
    setProfile({ ...emptyProfile(), ...(r.access_profile || {}) })
  }

  const seedDefaults = async () => {
    setSeeding(true)
    const res = await api.rolesSeedDefaults()
    setSeeding(false)
    if (res.ok) {
      notify({ type: 'success', title: 'Roles seeded', message: `${res.data?.ensured ?? 0} roles ready` })
      await load()
    } else {
      notify({ type: 'error', title: 'Seed failed', message: res.error || 'Apply migrations 011+012 on the DB' })
    }
  }

  const saveAccess = async () => {
    if (!selected || !canManage) return
    const res = await api.roleSetAccess(selected.id, profile)
    if (res.ok) {
      notify({ type: 'success', title: 'Access saved', message: selected.code })
      load()
    } else {
      notify({ type: 'error', title: 'Save failed', message: res.error || '' })
    }
  }

  const create = async () => {
    if (!newCode || !newName) return
    const res = await api.roleCreate({
      code: newCode.toLowerCase().trim(),
      name: newName.trim(),
      description: newDesc.trim() || undefined,
      access_profile: emptyProfile(),
    })
    if (res.ok) {
      notify({ type: 'success', title: 'Role created', message: newCode })
      setShowNew(false)
      setNewCode(''); setNewName(''); setNewDesc('')
      await load()
      if (res.data?.id) setSelectedId(res.data.id)
    } else {
      notify({ type: 'error', title: 'Create failed', message: res.error || '' })
    }
  }

  const remove = async (r: Role) => {
    if (r.is_system) return
    if (!window.confirm(`Delete role ${r.code}?`)) return
    const res = await api.roleDelete(r.id)
    if (res.ok) {
      notify({ type: 'success', title: 'Deleted', message: r.code })
      setSelectedId(null)
      load()
    } else {
      notify({ type: 'error', title: 'Delete failed', message: res.error || '' })
    }
  }

  if (!canManage) {
    return (
      <div className="erpnext-card p-6">
        <h2 className="text-lg font-semibold">Roles</h2>
        <p className="text-sm mt-2" style={{ color: 'var(--text-dim)' }}>Admin access required to configure roles.</p>
      </div>
    )
  }

  const levelSelect = (area: keyof AccessProfile, label: string, hint: string) => (
    <div className="erpnext-card p-4 space-y-2">
      <div className="font-medium">{label}</div>
      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{hint}</p>
      <select
        className="erpnext-input"
        value={profile[area]}
        onChange={e => setProfile(p => ({ ...p, [area]: e.target.value as AccessLevel }))}
      >
        {LEVELS.map(l => (
          <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Roles & Access</h2>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            High-level access: Inbound, Outbound, Admin. Levels: None / View / Edit.
            API enforcement stays off until <code>GOWMS_RBAC=1</code>.
          </p>
        </div>
        <div className="flex gap-2">
          {roles.length === 0 && (
            <button className="erpnext-btn-secondary" disabled={seeding} onClick={seedDefaults}>
              {seeding ? 'Seeding…' : 'Seed default roles'}
            </button>
          )}
          <button className="erpnext-btn-primary" onClick={() => setShowNew(!showNew)}>{showNew ? 'Cancel' : '+ Custom role'}</button>
        </div>
      </div>

      {roles.length === 0 && (
        <div className="erpnext-card p-4 text-sm" style={{ color: 'var(--text-dim)' }}>
          No roles in the database. Click <strong>Seed default roles</strong> (needs migrations 011+012),
          or run them on the VM, then refresh. Employees will use the same role list.
        </div>
      )}

      {showNew && (
        <div className="erpnext-card p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className="erpnext-label">Code *</label><input className="erpnext-input" value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="e.g. lead_picker" /></div>
            <div><label className="erpnext-label">Name *</label><input className="erpnext-input" value={newName} onChange={e => setNewName(e.target.value)} /></div>
            <div><label className="erpnext-label">Description</label><input className="erpnext-input" value={newDesc} onChange={e => setNewDesc(e.target.value)} /></div>
          </div>
          <div className="flex justify-end"><button className="erpnext-btn-primary" onClick={create}>Create</button></div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="erpnext-card overflow-hidden">
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <ListPager pager={pager} placeholder="Search roles…" />
          </div>
          <table className="erpnext-table">
            <thead><tr><th>Role</th><th></th></tr></thead>
            <tbody>
              {pager.pageItems.map(r => (
                <tr
                  key={r.id}
                  className={selectedId === r.id ? 'bg-black/5' : ''}
                  style={{ cursor: 'pointer' }}
                  onClick={() => selectRole(r)}
                >
                  <td>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                      {r.code}{r.is_system ? ' · system' : ''}
                      {r.access_profile && (
                        <> · I:{r.access_profile.inbound} O:{r.access_profile.outbound} A:{r.access_profile.admin}</>
                      )}
                    </div>
                  </td>
                  <td>
                    {!r.is_system && (
                      <button className="erpnext-btn-secondary text-xs" onClick={(e) => { e.stopPropagation(); remove(r) }}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
              {pager.total === 0 && (
                <tr><td colSpan={2} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No roles</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {!selected ? (
            <div className="erpnext-card p-4" style={{ color: 'var(--text-dim)' }}>Select a role</div>
          ) : (
            <>
              <div className="flex justify-between items-start gap-3">
                <div>
                  <h3 className="font-semibold">{selected.name}</h3>
                  <p className="text-sm" style={{ color: 'var(--text-dim)' }}>{selected.description || selected.code}</p>
                </div>
                <button className="erpnext-btn-primary" onClick={saveAccess}>Save access</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {levelSelect('inbound', 'Inbound', 'GRN, packing list, QI, putaway')}
                {levelSelect('outbound', 'Outbound', 'Sales orders, pick, pack, dispatch, backorders, returns')}
                {levelSelect('admin', 'Admin panel', 'Masters, employees, roles, analytics, import/export')}
              </div>
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                View = module access without employee/role manage. Edit = full area access.
                Admin Edit also grants full (*).
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
