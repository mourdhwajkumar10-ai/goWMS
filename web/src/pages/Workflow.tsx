import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'

interface Def {
  id: number
  name: string
  entity_type: string
  states: any
  transitions: any
  active: boolean
}

interface Inst {
  id: number
  entity_type: string
  entity_id: number
  current_state: string
  workflow_name: string
}

export default function Workflow() {
  const [defs, setDefs] = useState<Def[]>([])
  const [insts, setInsts] = useState<Inst[]>([])
  const [showNew, setShowNew] = useState(false)
  const [msg, setMsg] = useState('')
  const [activeTab, setActiveTab] = useState<'defs' | 'instances'>('defs')

  const [name, setName] = useState('')
  const [entityType, setEntityType] = useState('')
  const [states, setStates] = useState('')
  const [transitions, setTransitions] = useState('')

  const [instId, setInstId] = useState('')
  const [action, setAction] = useState('')

  const load = () => {
    api.get<Def[]>('/workflow/definitions').then(r => { if (r.ok) setDefs(r.data ?? []) })
    api.get<Inst[]>('/workflow/instances').then(r => { if (r.ok) setInsts(r.data ?? []) })
  }
  useEffect(() => { load() }, [])

  const createDef = async () => {
    const parsedStates = states.split(',').map(s => s.trim()).filter(Boolean).map(s => ({ name: s }))
    const parsedTransitions = transitions.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [from, to] = l.split(/[>-]/)
      return { from: from.trim(), to: to.trim() }
    })
    const r = await api.post('/workflow/definitions', {
      name, entity_type: entityType, states: parsedStates, transitions: parsedTransitions
    })
    if (r.ok) {
      setMsg(`Workflow "${name}" created`)
      setName(''); setEntityType(''); setStates(''); setTransitions('')
      setShowNew(false)
      load()
      notify({ type: 'success', title: 'Workflow Created', message: name })
    }
  }

  const advanceInstance = async () => {
    if (!instId || !action) return
    const r = await api.post(`/workflow/instances/${instId}/advance`, { action })
    if (r.ok) {
      setMsg(`Instance ${instId} advanced to "${action}"`)
      setInstId(''); setAction('')
      load()
      notify({ type: 'success', title: 'Instance Advanced', message: `→ ${action}` })
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Workflow</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>Define state machines and advance entity instances</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowNew(!showNew)} className="erpnext-btn-primary">
            {showNew ? '✕ Cancel' : '+ New Definition'}
          </button>
        </div>
      </div>

      {msg && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm" style={{ 
          background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)', color: 'var(--green)' 
        }}>
          <span>✓</span> {msg}
        </div>
      )}

      {/* Create Definition Form */}
      {showNew && (
        <div className="erpnext-card">
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">Create Workflow Definition</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="erpnext-label">Name *</label>
                <input className="erpnext-input" value={name} onChange={e => setName(e.target.value)} placeholder="PO Approval Workflow" />
              </div>
              <div>
                <label className="erpnext-label">Entity Type *</label>
                <input className="erpnext-input" value={entityType} onChange={e => setEntityType(e.target.value)} placeholder="purchase_order" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="erpnext-label">States (comma separated)</label>
                <input className="erpnext-input" value={states} onChange={e => setStates(e.target.value)} placeholder="draft, approved, rejected" />
              </div>
              <div>
                <label className="erpnext-label">Transitions (from → to, one per line)</label>
                <textarea className="erpnext-input" rows={3} value={transitions} onChange={e => setTransitions(e.target.value)} placeholder={"draft>approved\napproved>rejected"} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowNew(false)} className="erpnext-btn-secondary">Cancel</button>
              <button onClick={createDef} className="erpnext-btn-primary">Create Definition</button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={() => setActiveTab('defs')}
          className="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
          style={{ borderColor: activeTab === 'defs' ? 'var(--accent)' : 'transparent', color: activeTab === 'defs' ? 'var(--accent)' : 'var(--text-dim)', background: 'none', cursor: 'pointer' }}
        >
          Definitions ({defs.length})
        </button>
        <button
          onClick={() => setActiveTab('instances')}
          className="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
          style={{ borderColor: activeTab === 'instances' ? 'var(--accent)' : 'transparent', color: activeTab === 'instances' ? 'var(--accent)' : 'var(--text-dim)', background: 'none', cursor: 'pointer' }}
        >
          Instances ({insts.length})
        </button>
      </div>

      {/* Definitions Tab */}
      {activeTab === 'defs' && (
        <div className="erpnext-card">
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-semibold">Workflow Definitions</h2>
          </div>
          <div className="p-4">
            <table className="erpnext-table">
              <thead>
                <tr style={{ background: 'var(--panel-2)' }}>
                  <th>Name</th>
                  <th>Entity</th>
                  <th>States</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {defs.map(d => (
                  <tr key={d.id}>
                    <td className="font-medium">{d.name}</td>
                    <td>{d.entity_type}</td>
                    <td>{Array.isArray(d.states) ? d.states.map((s: any) => s.name).join(', ') : '—'}</td>
                    <td>
                      <span className={`erpnext-badge ${d.active ? 'erpnext-badge-green' : 'erpnext-badge-red'}`}>
                        {d.active ? 'active' : 'inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
                {defs.length === 0 && <tr><td colSpan={4} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No workflow definitions</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Instances Tab */}
      {activeTab === 'instances' && (
        <>
          <div className="erpnext-card">
            <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-lg font-semibold">Advance Instance</h2>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="erpnext-label">Instance ID</label>
                  <input className="erpnext-input" type="number" value={instId} onChange={e => setInstId(e.target.value)} placeholder="1" />
                </div>
                <div>
                  <label className="erpnext-label">Target State</label>
                  <input className="erpnext-input" value={action} onChange={e => setAction(e.target.value)} placeholder="approved" />
                </div>
                <div className="flex items-end">
                  <button onClick={advanceInstance} className="erpnext-btn-primary">Advance</button>
                </div>
              </div>
            </div>
          </div>

          <div className="erpnext-card">
            <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-lg font-semibold">Workflow Instances</h2>
            </div>
            <div className="p-4">
              <table className="erpnext-table">
                <thead>
                  <tr style={{ background: 'var(--panel-2)' }}>
                    <th>ID</th>
                    <th>Workflow</th>
                    <th>Entity</th>
                    <th>Entity ID</th>
                    <th>Current State</th>
                  </tr>
                </thead>
                <tbody>
                  {insts.map(i => (
                    <tr key={i.id}>
                      <td className="font-medium">{i.id}</td>
                      <td>{i.workflow_name}</td>
                      <td>{i.entity_type}</td>
                      <td>{i.entity_id}</td>
                      <td><span className="erpnext-badge erpnext-badge-blue">{i.current_state}</span></td>
                    </tr>
                  ))}
                  {insts.length === 0 && <tr><td colSpan={5} className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No instances</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
