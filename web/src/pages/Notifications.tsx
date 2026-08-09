import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'

interface Notif {
  id: number
  type: string
  title: string
  message: string | null
  is_read: boolean
  created_at: string
}

export default function Notifications() {
  const [list, setList] = useState<Notif[]>([])
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const loadList = () => api.notificationList().then(r => { if (r.ok) setList(r.data ?? []) })
  useEffect(() => { loadList() }, [])

  const markRead = async (id: number) => {
    const r = await api.notificationMarkRead(id)
    if (r.ok) {
      loadList()
      notify({ type: 'success', title: 'Marked as Read', message: '' })
    }
  }

  const markAllRead = async () => {
    const unread = list.filter(n => !n.is_read)
    for (const n of unread) {
      await api.notificationMarkRead(n.id)
    }
    loadList()
  }

  const filtered = filter === 'unread' ? list.filter(n => !n.is_read) : list

  const typeIcon = (type: string) => {
    switch (type) {
      case 'success': return '✓'
      case 'warning': return '⚠'
      case 'error': return '✕'
      default: return 'ℹ'
    }
  }

  const typeColor = (type: string) => {
    switch (type) {
      case 'success': return 'var(--green)'
      case 'warning': return 'var(--amber)'
      case 'error': return 'var(--red)'
      default: return 'var(--accent)'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Notifications</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>System alerts and messages</p>
        </div>
        {list.some(n => !n.is_read) && (
          <button onClick={markAllRead} className="erpnext-btn-secondary">Mark All Read</button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={() => setFilter('all')}
          className="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
          style={{ borderColor: filter === 'all' ? 'var(--accent)' : 'transparent', color: filter === 'all' ? 'var(--accent)' : 'var(--text-dim)', background: 'none', cursor: 'pointer' }}
        >
          All ({list.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
          style={{ borderColor: filter === 'unread' ? 'var(--accent)' : 'transparent', color: filter === 'unread' ? 'var(--accent)' : 'var(--text-dim)', background: 'none', cursor: 'pointer' }}
        >
          Unread ({list.filter(n => !n.is_read).length})
        </button>
      </div>

      <div className="erpnext-card">
        <div className="p-4 space-y-2">
          {filtered.map(n => (
            <div
              key={n.id}
              className="flex items-start gap-4 p-4 rounded-lg transition-colors"
              style={{ 
                background: n.is_read ? 'transparent' : 'rgba(37,99,235,0.03)',
                borderLeft: `3px solid ${typeColor(n.type)}`,
                opacity: n.is_read ? 0.6 : 1
              }}
            >
              <span className="text-lg mt-0.5" style={{ color: typeColor(n.type) }}>{typeIcon(n.type)}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{n.title}</span>
                  {!n.is_read && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }}></span>}
                </div>
                {n.message && <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>{n.message}</p>}
                <p className="text-xs mt-2" style={{ color: 'var(--text-dim)' }}>{new Date(n.created_at).toLocaleString()}</p>
              </div>
              {!n.is_read && (
                <button onClick={() => markRead(n.id)} className="text-xs erpnext-btn-secondary">Mark Read</button>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12" style={{ color: 'var(--text-dim)' }}>
              {filter === 'unread' ? 'No unread notifications' : 'No notifications'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
