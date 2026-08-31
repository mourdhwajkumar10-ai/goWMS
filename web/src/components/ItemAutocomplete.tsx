import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../services/api'
import { useAnchoredMenu } from './useAnchoredMenu'

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
  /** Fires when the typed value is finished (blur or Enter). Not while typing. */
  onCommit?: (text: string) => void
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  className?: string
  /** Which field the input itself shows/echoes. Suggestions match code, barcode and name either way. */
  display?: 'code' | 'name'
}

/** Debounced item typeahead against GET /masterdata/items?q= */
export default function ItemAutocomplete({ value, onSelect, onChangeText, onCommit, onKeyDown, placeholder, className, display = 'code' }: Props) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<ItemSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqSeq = useRef(0)
  const pickingRef = useRef(false)
  const committedRef = useRef(false)
  const { anchorRef, rect } = useAnchoredMenu(open, [results.length])

  useEffect(() => { setQuery(value) }, [value])

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
    const trimmed = q.trim()
    // Empty focus used to hit the full items list + COUNT(*) — that felt "stuck".
    if (!trimmed) {
      setResults([])
      setOpen(false)
      setLoading(false)
      return
    }
    const run = async () => {
      const seq = ++reqSeq.current
      setLoading(true)
      const r = await api.itemSuggest(trimmed, 12)
      // Ignore stale responses when the user typed ahead of the previous request.
      if (seq !== reqSeq.current) return
      if (r.ok && r.data) {
        setResults(r.data)
        setOpen(true)
      }
      setLoading(false)
    }
    if (immediate) {
      void run()
      return
    }
    // Slightly longer debounce for 1-char queries (they match the most rows).
    timer.current = setTimeout(run, trimmed.length < 2 ? 220 : 120)
  }, [])

  const handleChange = (val: string) => {
    committedRef.current = false
    setQuery(val)
    onChangeText?.(val)
    search(val)
  }

  const handleSelect = (item: ItemSuggestion) => {
    pickingRef.current = true
    setQuery(display === 'name' ? (item.name || item.code) : item.code)
    setOpen(false)
    onSelect(item)
  }

  const handleCommit = () => {
    if (pickingRef.current) {
      pickingRef.current = false
      setOpen(false)
      return
    }
    // If there are results and user pressed Enter, auto-select the first match
    if (results.length > 0 && query.trim()) {
      const q = query.trim().toLowerCase()
      const match = results.find((r: any) =>
        (r.code || '').toLowerCase().includes(q) ||
        (r.name || '').toLowerCase().includes(q) ||
        (r.barcode || '').toLowerCase() === q
      ) || results[0]
      if (match) {
        handleSelect(match)
        return
      }
    }
    setOpen(false)
    if (committedRef.current) return
    committedRef.current = true
    onCommit?.(query)
  }

  const menu = open && rect ? createPortal(
    <div
      ref={menuRef}
      className="item-suggest-menu rounded-lg shadow-lg overflow-y-auto border"
      style={{
        position: 'fixed',
        top: rect.top,
        left: rect.left,
        width: Math.max(rect.width, 280),
        maxHeight: 220,
        zIndex: 2000,
        background: 'var(--card, #fff)',
        borderColor: 'var(--border)',
      }}
    >
      {results.length > 0 ? (
        results.slice(0, 10).map((item) => {
          const code = String(item.code || '').trim()
          const name = String(item.name || '').trim()
          const primary = display === 'name' ? (name || code) : code
          const secondary = display === 'name' ? code : name
          const showSecondary = !!secondary && secondary.toLowerCase() !== primary.toLowerCase()
          return (
            <button
              key={item.id ?? code}
              type="button"
              className="item-suggest-row w-full text-left border-b last:border-0"
              style={{
                borderColor: 'var(--border)',
                padding: '6px 10px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 2,
                background: 'transparent',
                cursor: 'pointer',
              }}
              onMouseDown={() => handleSelect(item)}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', lineHeight: 1.3 }}>
                {primary || '—'}
              </span>
              {showSecondary ? (
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-dim)', lineHeight: 1.3 }}>
                  {secondary}
                </span>
              ) : null}
            </button>
          )
        })
      ) : (
        !loading && (
          <div style={{ padding: '6px 10px', color: 'var(--text-dim)', fontSize: 11 }}>
            No matching items — keep typing or scan
          </div>
        )
      )}
    </div>,
    document.body,
  ) : null

  return (
    <div ref={ref} className="relative">
      <input
        ref={anchorRef as React.RefObject<HTMLInputElement>}
        className={className || 'erpnext-input text-sm w-full'}
        value={query}
        title={query.length > 18 ? query : undefined}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => search(query, true)}
        onClick={() => search(query, true)}
        onBlur={handleCommit}
        placeholder={placeholder || 'Scan barcode or type...'}
        autoComplete="off"
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleCommit()
          } else if (e.key === 'Tab' && query.trim() && results.length > 0) {
            // Tab also auto-selects the first match, then lets focus move naturally
            const q = query.trim().toLowerCase()
            const match = results.find((r: any) =>
              (r.code || '').toLowerCase().includes(q) ||
              (r.name || '').toLowerCase().includes(q)
            ) || results[0]
            if (match) {
              e.preventDefault()
              handleSelect(match)
            }
          }
          onKeyDown?.(e)
        }}
      />
      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-dim)' }}>...</div>
      )}
      {menu}
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
