import { useMemo, useState, useEffect, useRef, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredMenu } from './useAnchoredMenu'

export type BoxSuggestion = {
  carton_no: string
  status?: string
  is_expected?: boolean
}

type Props = {
  value: string
  onChangeText: (text: string) => void
  onSelect?: (row: BoxSuggestion) => void
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  suggestions: BoxSuggestion[]
  placeholder?: string
  className?: string
  ariaLabel?: string
  /** Hide the dropdown (e.g. while a confirm modal is open). */
  closed?: boolean
}

export default function BoxAutocomplete({
  value, onChangeText, onSelect, onKeyDown, suggestions, placeholder, className, ariaLabel, closed,
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    const seen = new Set<string>()
    const out: BoxSuggestion[] = []
    for (const row of suggestions) {
      const no = String(row.carton_no || '').trim()
      if (!no || no.toUpperCase() === 'CONSOLIDATED') continue
      const key = no.toUpperCase()
      if (seen.has(key)) continue
      if (q && !no.toLowerCase().includes(q)) continue
      seen.add(key)
      out.push({ ...row, carton_no: no })
      if (out.length >= 12) break
    }
    return out
  }, [suggestions, value])

  const { anchorRef, rect } = useAnchoredMenu(open && !closed && filtered.length > 0, [filtered.length, closed])

  useEffect(() => {
    if (closed) setOpen(false)
  }, [closed])

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

  const handleSelect = (row: BoxSuggestion) => {
    onChangeText(row.carton_no)
    setOpen(false)
    onSelect?.(row)
  }

  const menu = open && !closed && rect && filtered.length > 0 ? createPortal(
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
      {filtered.map((row) => (
        <button
          key={row.carton_no}
          type="button"
          className="w-full text-left px-3 py-2 text-sm border-b last:border-0"
          style={{ borderColor: 'var(--border)' }}
          onMouseDown={() => handleSelect(row)}
        >
          <span className="font-medium">{row.carton_no}</span>
          <span className="ml-2 text-xs" style={{ color: 'var(--text-dim)' }}>
            {[row.is_expected ? 'expected' : null, row.status].filter(Boolean).join(' · ')}
          </span>
        </button>
      ))}
    </div>,
    document.body,
  ) : null

  return (
    <div ref={ref} className="relative flex-1">
      <input
        ref={anchorRef as React.RefObject<HTMLInputElement>}
        className={className || 'erpnext-input w-full'}
        value={value}
        onChange={e => {
          onChangeText(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        placeholder={placeholder || 'Scan or pick a box'}
        autoComplete="off"
        aria-label={ariaLabel || placeholder || 'Box'}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false)
          onKeyDown?.(e)
        }}
      />
      {menu}
    </div>
  )
}
