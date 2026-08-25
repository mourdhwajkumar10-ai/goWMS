import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { notify } from '../components/Notifications'
import ListPager from '../components/ListPager'
import { useClientPager } from '../hooks/useClientPager'
import { useLoadMore } from '../hooks/useLoadMore'
import { useRfUi } from '../hooks/useRfUi'
import RfShell from '../components/RfShell'
import '../styles/scanner.css'

interface Notif {
  id: number
  type: string
  title: string
  message: string | null
  is_read: boolean
  created_at: string
}

export default function Notifications() {
  const rf = useRfUi()
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
  const pager = useClientPager(filtered)
  const rfMore = useLoadMore(pager.filtered, 10, `${filter}|${pager.q}`)
  const unreadCount = list.filter(n => !n.is_read).length

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

  if (rf) {
    return (
      <RfShell title="Notifications" meta={filter} stat={String(unreadCount)}>
        <div className="scan-tabs" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className={`scan-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({list.length})
          </button>
          <button
            type="button"
            className={`scan-tab ${filter === 'unread' ? 'active' : ''}`}
            onClick={() => setFilter('unread')}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            className="scan-btn scan-btn-outline"
            style={{ marginBottom: 12 }}
            onClick={markAllRead}
          >
            Mark All Read
          </button>
        )}

        <div className="scan-bottom-bar" style={{ marginBottom: 10 }}>
          <div className="scan-input-chip">
            <input
              type="search"
              value={pager.q}
              onChange={e => pager.setQ(e.target.value)}
              placeholder="Search notifications…"
              autoComplete="off"
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rfMore.visible.map(n => (
            <div
              key={n.id}
              className="scan-select-card"
              style={{
                cursor: 'default',
                opacity: n.is_read ? 0.65 : 1,
                borderLeft: `3px solid ${typeColor(n.type)}`,
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: typeColor(n.type), fontSize: 18, lineHeight: 1.2 }}>{typeIcon(n.type)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="scan-select-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {n.title}
                    {!n.is_read && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: 'var(--primary)',
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>
                  {n.message && <div className="scan-select-card-sub">{n.message}</div>}
                  <div className="scan-select-card-meta">
                    <span>{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              {!n.is_read && (
                <button
                  type="button"
                  className="scan-btn scan-btn-outline scan-btn-sm"
                  style={{ marginTop: 10 }}
                  onClick={() => markRead(n.id)}
                >
                  Mark Read
                </button>
              )}
            </div>
          ))}
          {rfMore.hasMore && (
            <button type="button" className="scan-btn scan-btn-outline" onClick={rfMore.loadMore}>
              Load more ({rfMore.remaining} left)
            </button>
          )}
          {pager.total === 0 && (
            <div className="scan-section-card" style={{ textAlign: 'center' }}>
              <p style={{ fontWeight: 600, color: 'var(--foreground)' }}>
                {filter === 'unread' ? 'No unread notifications' : 'No notifications'}
              </p>
            </div>
          )}
        </div>
      </RfShell>
    )
  }

  return (
    <div className="desk-page space-y-3">
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
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <ListPager pager={pager} placeholder="Search notifications…" />
        </div>
        <div className="p-4 space-y-2">
          {pager.pageItems.map(n => (
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
          {pager.total === 0 && (
            <div className="text-center py-12" style={{ color: 'var(--text-dim)' }}>
              {filter === 'unread' ? 'No unread notifications' : 'No notifications'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
