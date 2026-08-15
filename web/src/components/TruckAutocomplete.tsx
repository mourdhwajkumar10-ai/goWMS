import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../services/api'
import { useAnchoredMenu } from './useAnchoredMenu'

export type TransportSuggestion = {
  id?: number
  truck_no: string
  name?: string
  transporter?: string
  driver_name?: string
  driver_phone?: string
}

type Props = {
  value: string
  onChangeText: (text: string) => void
  onSelect?: (row: TransportSuggestion) => void
  placeholder?: string
  className?: string
  id?: string
  ariaLabel?: string
  matchField?: 'truck_no' | 'name'
}

export default function TruckAutocomplete({
  value, onChangeText, onSelect, placeholder, className, id, ariaLabel, matchField = 'truck_no',
}: Props) {
  const [results, setResults] = useState<TransportSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { anchorRef, rect } = useAnchoredMenu(open, [results.length])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = useCallback((q: string, immediate = false) => {
    if (timer.current) clearTimeout(timer.current)
    const run = async () => {
      setLoading(true)
      const r = await api.transportsList(q.trim() || undefined)
      if (r.ok) {
        setResults(r.data ?? [])
        setOpen(true)
      }
      setLoading(false)
    }
    if (immediate) {
      void run()
      return
    }
    timer.current = setTimeout(run, 120)
  }, [])

  const handleChange = (val: string) => {
    onChangeText(val)
    search(val)
  }

  const handleSelect = (row: TransportSuggestion) => {
    onChangeText(matchField === 'name' ? (row.name || row.truck_no) : row.truck_no)
    setOpen(false)
    onSelect?.(row)
  }

  const menu = open && rect ? createPortal(
    <div
      ref={menuRef}
      className="rounded-lg shadow-lg overflow-y-auto border"
      style={{
        position: 'fixed',
        top: rect.top,
        left: rect.left,
        width: rect.width,
        maxHeight: 240,
        zIndex: 2000,
        background: 'var(--panel)',
        borderColor: 'var(--border)',
      }}
    >
      {results.length > 0 ? (
        results.slice(0, 12).map((row) => (
          <button
            key={row.id ?? row.truck_no}
            type="button"
            className="w-full text-left px-3 py-2 text-sm border-b last:border-0"
            style={{ borderColor: 'var(--border)' }}
            onMouseDown={() => handleSelect(row)}
          >
            <div className="font-medium">{row.truck_no}</div>
            <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
              {[row.name, row.transporter, row.driver_name].filter(Boolean).join(' · ') || 'Saved truck'}
            </div>
          </button>
        ))
      ) : (
        !loading && (
          <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-dim)' }}>
            No saved trucks yet — type a number or add one under Masters → Transport
          </div>
        )
      )}
    </div>,
    document.body,
  ) : null

  return (
    <div ref={ref} className="relative">
      <input
        id={id}
        ref={anchorRef as React.RefObject<HTMLInputElement>}
        className={className || 'erpnext-input'}
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => search(value, true)}
        onClick={() => search(value, true)}
        placeholder={placeholder}
        autoComplete="off"
        aria-label={ariaLabel || placeholder}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-dim)' }}>...</div>
      )}
      {menu}
    </div>
  )
}
