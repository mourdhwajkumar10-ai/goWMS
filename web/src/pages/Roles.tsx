import { useEffect, useMemo, useState } from 'react'
import { api, getRole } from '../services/api'
import { notify } from '../components/Notifications'

type Perm = { code: string; module: string; name: string; description: string }
type Role = {
  id: number
  code: string
  name: string
  description: string
  is_system: boolean
  permissions: string[]
}

export default function Roles() {
  const myRole = (getRole() || '').toLowerCase()
  const canManage = myRole === 'admin'

  const [roles, setRoles] = useState<Role[]>([])
  const [catalog, setCatalog] = useState<Perm[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [showNew, setShowNew] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const selected = roles.find(r => r.id === selectedId) || null

  const byModule = useMemo(() => {
    const m = new Map<string, Perm[]>()
    for (const p of catalog) {
      if (p.code === '*') continue
      const list = m.get(p.module) || []
      list.push(p)
      m.set(p.module, list)
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [catalog])

  const load = async () => {
    const [r, p] = await Promise.all([api.rolesList(), api.permissionsCatalog()])
    if (r.ok) {
      setRoles(r.data ?? [])
      if (selectedId == null && (r.data?.length ?? 0) > 0) {
        const first = r.data![0]
        setSelectedId(first.id)
        setChecked(new Set(first.permissions || []))
      } else if (selectedId != null) {
        const cur = (r.data ?? []).find((x: Role) => x.id === selectedId)
        if (cur) setChecked(new Set(cur.permissions || []))
      }
    }
    if (p.ok) setCatalog(p.data ?? [])
  }

  useEffect(() => { load() }, [])

  const selectRole = (r: Role) => {
    setSelectedId(r.id)
    setChecked(new Set(r.permissions || []))
  }

  const toggle = (code: string) => {
    if (!canManage) return
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const savePerms = async () => {
    if (!selected || !canManage) return
    const perms = Array.from(checked)
    const res = await api.roleSetPermissions(selected.id, perms)
    if (res.ok) {
      notify({ type: 'success', title: 'Permissions saved', message: selected.code })
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
      permissions: [],
    })
    if (res.ok) {
      notify({ type: 'success', title: 'Role created', message: newCode })
      setShowNew(false)
      setNewCode(''); setNewName(''); setNewDesc('')
      await load()
      if (res.data?.id) {
        const created = (await api.rolesList()).data?.find((x: Role) => x.id === res.data!.id)
        if (created) selectRole(created)
      }
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Roles & Permissions</h2>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            Configure what each role can access. API enforcement stays off until <code>GOWMS_RBAC=1</code>.
          </p>
        </div>
        <button className="erpnext-btn-primary" onClick={() => setShowNew(!showNew)}>{showNew ? 'Cancel' : '+ Custom role'}</button>
      </div>

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
          <table className="erpnext-table">
            <thead><tr><th>Role</th><th></th></tr></thead>
            <tbody>
              {roles.map(r => (
                <tr
                  key={r.id}
                  className={selectedId === r.id ? 'bg-black/5' : ''}
                  style={{ cursor: 'pointer' }}
                  onClick={() => selectRole(r)}
                >
                  <td>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                      {r.code}{r.is_system ? ' · system' : ''} · {(r.permissions || []).length} perms
                    </div>
                  </td>
                  <td>
                    {!r.is_system && (
                      <button className="erpnext-btn-secondary text-xs" onClick={(e) => { e.stopPropagation(); remove(r) }}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
              {roles.length === 0 && (
                <tr><td colSpan={2} className="text-center py-6" style={{ color: 'var(--text-dim)' }}>No roles — apply migration 011</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="erpnext-card p-4 lg:col-span-2 space-y-4">
          {!selected ? (
            <p style={{ color: 'var(--text-dim)' }}>Select a role</p>
          ) : (
            <>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold">{selected.name}</h3>
                  <p className="text-sm" style={{ color: 'var(--text-dim)' }}>{selected.description || selected.code}</p>
                </div>
                <button className="erpnext-btn-primary" onClick={savePerms}>Save permissions</button>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked.has('*')}
                  onChange={() => toggle('*')}
                />
                <span><strong>Full access (*)</strong> — bypass all module checks</span>
              </label>

              {byModule.map(([mod, perms]) => (
                <div key={mod}>
                  <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-dim)' }}>{mod.replace('_', ' ')}</div>
                  <div className="space-y-2">
                    {perms.map(p => (
                      <label key={p.code} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={checked.has(p.code) || checked.has('*')}
                          disabled={checked.has('*')}
                          onChange={() => toggle(p.code)}
                        />
                        <span>
                          <span className="font-medium">{p.name}</span>
                          <span className="ml-2 text-xs" style={{ color: 'var(--text-dim)' }}>{p.code}</span>
                          {p.description && <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{p.description}</div>}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
