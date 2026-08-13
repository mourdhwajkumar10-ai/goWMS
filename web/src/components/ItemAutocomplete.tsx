import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../services/api'

export type ItemSuggestion = {
  id?: number
  code: string
  name?: string
  brand?: string
  barcode?: string
  [key: string]: any
}

type Props = {
  value: string
  onSelect: (item: ItemSuggestion) => void
  onChangeText?: (text: string) => void
  placeholder?: string
  className?: string
}

/** Debounced item typeahead against GET /masterdata/items?q= */
export default function ItemAutocomplete({ value, onSelect, onChangeText, placeholder, className }: Props) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<ItemSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = useCallback((q: string) => {
    if (timer.current) clearTimeout(timer.current)
    if (!q.trim()) { setResults([]); setOpen(false); return }
    setLoading(true)
    timer.current = setTimeout(async () => {
      const r = await api.itemList(q)
      if (r.ok && r.data) {
        setResults(r.data)
        setOpen(true)
      }
      setLoading(false)
    }, 200)
  }, [])

  const handleChange = (val: string) => {
    setQuery(val)
    onChangeText?.(val)
    search(val)
  }

  const handleSelect = (item: ItemSuggestion) => {
    setQuery(item.code)
    setOpen(false)
    onSelect(item)
  }

  return (
    <div ref={ref} className="relative">
      <input
        className={className || 'erpnext-input text-sm w-full'}
        value={query}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => query.trim() && results.length > 0 && setOpen(true)}
        placeholder={placeholder || 'Scan barcode or type...'}
        autoComplete="off"
      />
      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-dim)' }}>...</div>
      )}
      {open && results.length > 0 && (
        <div
          className="absolute z-50 mt-1 w-full rounded-lg shadow-lg max-h-60 overflow-y-auto border"
          style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}
        >
          {results.slice(0, 10).map((item) => (
            <button
              key={item.id ?? item.code}
              type="button"
              className="w-full text-left px-3 py-2 flex justify-between items-center text-sm border-b last:border-0"
              style={{ borderColor: 'var(--border)' }}
              onMouseDown={() => handleSelect(item)}
            >
              <div>
                <span className="font-medium">{item.code}</span>
                <span className="ml-2" style={{ color: 'var(--text-dim)' }}>{item.name}</span>
              </div>
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{item.brand || ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Keep exactly one trailing empty row after a filled last row (auto-add without clicking +). */
export function withTrailingEmptyRow<T>(
  rows: T[],
  isFilled: (row: T) => boolean,
  emptyRow: () => T,
): T[] {
  if (rows.length === 0) return [emptyRow()]
  const last = rows[rows.length - 1]
  if (isFilled(last)) return [...rows, emptyRow()]
  // collapse multiple trailing empties
  let end = rows.length
  while (end > 1 && !isFilled(rows[end - 1]) && !isFilled(rows[end - 2])) end--
  return end === rows.length ? rows : rows.slice(0, end)
}

export function stripTrailingEmptyRows<T>(rows: T[], isFilled: (row: T) => boolean): T[] {
  let end = rows.length
  while (end > 0 && !isFilled(rows[end - 1])) end--
  return rows.slice(0, end)
}
