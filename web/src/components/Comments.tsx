import { useEffect, useState } from 'react'
import api from '../services/api'

interface Comment {
  id: number
  text: string
  user_id: number
  created_at: string
}

interface Props {
  entityType: string
  entityId: number
}

export default function Comments({ entityType, entityId }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)

  const load = () => {
    api.commentList(entityType, entityId).then(r => {
      if (r.ok) setComments(r.data ?? [])
    })
  }

  useEffect(() => { load() }, [entityType, entityId])

  const add = async () => {
    if (!text.trim()) return
    setLoading(true)
    const r = await api.commentCreate(entityType, entityId, text.trim())
    setLoading(false)
    if (r.ok) {
      setText('')
      load()
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Comments</h4>
      {comments.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>No comments yet</p>
      )}
      {comments.map(c => (
        <div key={c.id} style={{
          padding: '8px 12px',
          background: 'var(--panel-2)',
          borderRadius: 8,
          marginBottom: 6,
          fontSize: 13
        }}>
          <div>{c.text}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
            {new Date(c.created_at).toLocaleString()}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          className="erpnext-input"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Add a comment..."
          style={{ flex: 1 }}
        />
        <button className="erpnext-btn-primary btn-sm" onClick={add} disabled={loading || !text.trim()}>
          Add
        </button>
      </div>
    </div>
  )
}
