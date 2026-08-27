import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../services/api'
import { useAnchoredMenu } from './useAnchoredMenu'

export type SupplierSuggestion = {
  id: number
  name: string
  supplier_group?: string | null
  gstin?: string | null
  barcode?: string
  contact_phone?: string | null
  contact_email?: string | null
}

type Props = {
  value: string
  onChangeText: (text: string) => void
  onSelect?: (row: SupplierSuggestion) => void
  placeholder?: string
  className?: string
  id?: string
  ariaLabel?: string
}

function matchesQuery(s: SupplierSuggestion, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return (
    (s.name || '').toLowerCase().includes(needle) ||
    (s.gstin || '').toLowerCase().includes(needle) ||
    (s.barcode || '').toLowerCase().includes(needle) ||
    (s.supplier_group || '').toLowerCase().includes(needle)
  )
}

function exactCodeMatch(s: SupplierSuggestion, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return false
  return (
    (s.barcode || '').trim().toLowerCase() === needle ||
    (s.gstin || '').trim().toLowerCase() === needle
  )
}

export default function SupplierAutocomplete({
  value, onChangeText, onSelect, placeholder, className, id, ariaLabel,
}: Props) {
  const [results, setResults] = useState<SupplierSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const listRef = useRef<SupplierSuggestion[] | null>(null)
  const loadPromise = useRef<Promise<SupplierSuggestion[]> | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { anchorRef, rect } = useAnchoredMenu(open, [results.length])

  const ensureLoaded = useCallback(async () => {
    if (listRef.current) return listRef.current
    if (loadPromise.current) return loadPromise.current
    setLoading(true)
    loadPromise.current = api.supplierList().then((r) => {
      const list = ((r.ok ? r.data : []) ?? []) as SupplierSuggestion[]
      listRef.current = list
      setLoading(false)
      return list
    })
    return loadPromise.current
  }, [])

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

  const showFiltered = useCallback(async (q: string) => {
    const list = await ensureLoaded()
    const filtered = list.filter(s => matchesQuery(s, q.trim())).slice(0, 12)
    setResults(filtered)
    setOpen(true)
  }, [ensureLoaded])

  const handleChange = (val: string) => {
    onChangeText(val)
    void showFiltered(val)
  }

  const handleSelect = (row: SupplierSuggestion) => {
    onChangeText(row.name || '')
    setOpen(false)
    onSelect?.(row)
  }

  /** Resolve barcode / GSTIN paste or scan to a known supplier name. */
  const tryResolveCode = async (raw: string) => {
    const code = raw.trim()
    if (!code) return
    const list = await ensureLoaded()
    // Already a known supplier name — nothing to resolve
    if (list.some(s => (s.name || '').trim().toLowerCase() === code.toLowerCase())) return
    const local = list.find(s => exactCodeMatch(s, code))
    if (local) {
      handleSelect(local)
      return
    }
    // Barcodes / GSTIN don't contain spaces — skip free-text names
    if (/\s/.test(code)) return
    const r = await api.supplierByBarcode(code)
    if (r.ok && r.data?.found && r.data.name) {
      handleSelect({
        id: r.data.id,
        name: r.data.name,
        gstin: r.data.gstin,
        barcode: r.data.barcode,
      })
    }
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
        results.map((row) => (
          <button
            key={row.id}
            type="button"
            className="w-full text-left px-3 py-2 text-sm border-b last:border-0"
            style={{ borderColor: 'var(--border)' }}
            onMouseDown={(e) => { e.preventDefault(); handleSelect(row) }}
          >
            <div className="font-medium">{row.name}</div>
            <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
              {[row.supplier_group, row.gstin, row.barcode].filter(Boolean).join(' · ') || 'Supplier'}
            </div>
          </button>
        ))
      ) : (
        !loading && (
          <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-dim)' }}>
            No matching suppliers — type a name or add one under Masters → Supplier
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
        onFocus={() => { void showFiltered(value) }}
        onClick={() => { void showFiltered(value) }}
        onBlur={() => {
          // Delay so mousedown on a suggestion still fires first
          window.setTimeout(() => {
            void tryResolveCode(value)
          }, 180)
        }}
        placeholder={placeholder}
        autoComplete="off"
        aria-label={ariaLabel || placeholder}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter' || e.key === 'Tab') {
            if (results.length > 0) {
              e.preventDefault()
              handleSelect(results[0])
            } else if (e.key === 'Enter') {
              void tryResolveCode(value)
            }
          }
        }}
      />
      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-dim)' }}>...</div>
      )}
      {menu}
    </div>
  )
}
