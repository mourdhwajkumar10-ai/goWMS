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

export type TransportMatchField = 'truck_no' | 'name' | 'driver_name' | 'driver_phone' | 'transporter'

type Props = {
  value: string
  onChangeText: (text: string) => void
  onSelect?: (row: TransportSuggestion) => void
  placeholder?: string
  className?: string
  id?: string
  ariaLabel?: string
  matchField?: TransportMatchField
  /** When true, blur with an exact master match auto-fills via onSelect */
  autoFillOnExactMatch?: boolean
}

function fieldValue(row: TransportSuggestion, field: TransportMatchField) {
  switch (field) {
    case 'name':
      return row.name || ''
    case 'driver_name':
      return row.driver_name || ''
    case 'driver_phone':
      return row.driver_phone || ''
    case 'transporter':
      return row.transporter || ''
    default:
      return row.truck_no || ''
  }
}

function primaryLabel(row: TransportSuggestion, field: TransportMatchField) {
  const v = fieldValue(row, field)
  if (v) return v
  if (field !== 'truck_no' && row.truck_no) return row.truck_no
  return row.driver_name || row.transporter || 'Saved transport'
}

function secondaryLabel(row: TransportSuggestion, field: TransportMatchField) {
  const parts: string[] = []
  if (field !== 'truck_no' && row.truck_no) parts.push(row.truck_no)
  if (field !== 'driver_name' && row.driver_name) parts.push(row.driver_name)
  if (field !== 'driver_phone' && row.driver_phone) parts.push(row.driver_phone)
  if (field !== 'transporter' && row.transporter) parts.push(row.transporter)
  if (field !== 'name' && row.name) parts.unshift(row.name)
  return parts.filter(Boolean).join(' · ') || 'Saved transport'
}

export function applyTransportMaster(
  row: TransportSuggestion,
  base: {
    truck_no?: string
    driver_name?: string
    driver_phone?: string
    transporter?: string
  } = {},
) {
  return {
    ...base,
    truck_no: row.truck_no || base.truck_no || '',
    driver_name: row.driver_name || base.driver_name || '',
    driver_phone: row.driver_phone || base.driver_phone || '',
    transporter: row.transporter || base.transporter || '',
  }
}

export default function TruckAutocomplete({
  value,
  onChangeText,
  onSelect,
  placeholder,
  className,
  id,
  ariaLabel,
  matchField = 'truck_no',
  autoFillOnExactMatch = true,
}: Props) {
  const [results, setResults] = useState<TransportSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectedFromMenu = useRef(false)
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
    selectedFromMenu.current = true
    onChangeText(fieldValue(row, matchField) || row.truck_no)
    setOpen(false)
    onSelect?.(row)
  }

  const tryExactMatch = useCallback(async (text: string) => {
    if (!autoFillOnExactMatch || !onSelect) return
    const q = text.trim()
    if (q.length < 2) return
    const r = await api.transportsList(q)
    if (!r.ok || !r.data?.length) return
    const needle = q.toLowerCase()
    const exact = (r.data as TransportSuggestion[]).find((row) => {
      const v = fieldValue(row, matchField).trim().toLowerCase()
      return v && v === needle
    })
    if (exact) onSelect(exact)
  }, [autoFillOnExactMatch, matchField, onSelect])

  const handleBlur = () => {
    if (selectedFromMenu.current) {
      selectedFromMenu.current = false
      return
    }
    void tryExactMatch(value)
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
            key={row.id ?? `${row.truck_no}-${row.driver_name}`}
            type="button"
            className="w-full text-left px-3 py-2 text-sm border-b last:border-0"
            style={{ borderColor: 'var(--border)' }}
            onMouseDown={() => handleSelect(row)}
          >
            <div className="font-medium">{primaryLabel(row, matchField)}</div>
            <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
              {secondaryLabel(row, matchField)}
            </div>
          </button>
        ))
      ) : (
        !loading && (
          <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-dim)' }}>
            No saved transport — add under Masters → Transport
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
        onBlur={handleBlur}
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
