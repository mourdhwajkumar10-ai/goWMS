import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react'
import { api } from '../services/api'

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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
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

  return (
    <div ref={ref} className="relative">
      <input
        id={id}
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
      {open && results.length > 0 && (
        <div
          className="absolute z-50 mt-1 w-full rounded-lg shadow-lg max-h-60 overflow-y-auto border"
          style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}
        >
          {results.slice(0, 12).map((row) => (
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
          ))}
        </div>
      )}
      {open && !loading && results.length === 0 && (
        <div
          className="absolute z-50 mt-1 w-full rounded-lg shadow-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text-dim)' }}
        >
          No saved trucks yet — type a number or add one under Masters → Transport
        </div>
      )}
    </div>
  )
}
