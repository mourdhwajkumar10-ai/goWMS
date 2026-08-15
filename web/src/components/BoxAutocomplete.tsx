import { useMemo, useState, useEffect, useRef, type KeyboardEvent } from 'react'

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
}

export default function BoxAutocomplete({
  value, onChangeText, onSelect, onKeyDown, suggestions, placeholder, className, ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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

  const handleSelect = (row: BoxSuggestion) => {
    onChangeText(row.carton_no)
    setOpen(false)
    onSelect?.(row)
  }

  return (
    <div ref={ref} className="relative flex-1">
      <input
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
      {open && filtered.length > 0 && (
        <div
          className="absolute z-50 mt-1 w-full rounded-lg shadow-lg max-h-60 overflow-y-auto border"
          style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}
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
        </div>
      )}
      {open && filtered.length === 0 && (
        <div
          className="absolute z-50 mt-1 w-full rounded-lg shadow-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text-dim)' }}
        >
          No saved boxes yet — scan or type a new ID
        </div>
      )}
    </div>
  )
}
