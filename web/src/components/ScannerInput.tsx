import { useState, useRef, useEffect, useMemo, useCallback, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredMenu } from './useAnchoredMenu'

interface ScannerInputProps {
  onScan: (value: string) => void
  placeholder?: string
  suggestions?: Array<{ code: string; name: string; qty?: number }>
  onSelectSuggestion?: (code: string) => void
  showTorch?: boolean
  autoFocus?: boolean
}

export default function ScannerInput({
  onScan,
  placeholder = 'Scan or type...',
  suggestions = [],
  onSelectSuggestion,
  showTorch = false,
  autoFocus = false,
}: ScannerInputProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const { anchorRef, rect } = useAnchoredMenu(open, [suggestions.length])

  useEffect(() => {
    if (inputRef.current) {
      ;(anchorRef as React.MutableRefObject<HTMLInputElement | null>).current = inputRef.current
    }
  }, [anchorRef])

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return suggestions.slice(0, 10)
    return suggestions
      .filter(
        (s) =>
          s.code.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q),
      )
      .slice(0, 10)
  }, [suggestions, query])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      e.target.value = ''

      const BD = (window as any).BarcodeDetector
      if (BD) {
        try {
          const bitmap = await createImageBitmap(file)
          const detector = new BD({ formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'code_39', 'itf', 'data_matrix', 'codabar'] })
          const results = await detector.detect(bitmap)
          if (results.length > 0) {
            onScan(results[0].rawValue)
            navigator.vibrate?.(10)
            return
          }
        } catch {
          // fall through to filename fallback
        }
      }

      onScan(file.name.replace(/\.[^.]+$/, ''))
      navigator.vibrate?.(10)
    },
    [onScan],
  )

  const handleManualSubmit = useCallback(() => {
    const value = query.trim()
    if (!value) return
    onScan(value)
    navigator.vibrate?.(10)
    setQuery('')
  }, [query, onScan])

  const handleSelectSuggestion = useCallback(
    (code: string) => {
      onSelectSuggestion?.(code)
      setQuery('')
      setOpen(false)
    },
    [onSelectSuggestion],
  )

  const toggleTorch = useCallback(async () => {
    if (!trackRef.current) {
      // Try to get camera track for torch
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        })
        const track = stream.getVideoTracks()[0]
        trackRef.current = track
      } catch {
        return
      }
    }
    const track = trackRef.current
    if (!track) return
    const capabilities = track.getCapabilities() as { torch?: boolean }
    if (!capabilities.torch) return
    const newTorch = !torchOn
    await track.applyConstraints({ advanced: [{ torch: newTorch } as any] })
    setTorchOn(newTorch)
  }, [torchOn])

  const menu =
    open && rect && filtered.length > 0
      ? createPortal(
          <div
            ref={menuRef}
            className="scanner-suggestions rounded-lg shadow-lg overflow-y-auto border"
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
            {filtered.map((s) => (
              <button
                key={s.code}
                type="button"
                className="w-full text-left px-3 py-2 flex justify-between items-center gap-2 text-sm border-b last:border-0"
                style={{ borderColor: 'var(--border)' }}
                onMouseDown={() => handleSelectSuggestion(s.code)}
              >
                <div className="min-w-0">
                  <span className="font-medium">{s.code}</span>
                  <span className="ml-2" style={{ color: 'var(--text-dim)' }}>
                    {s.name}
                  </span>
                </div>
                {s.qty != null && (
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    {s.qty}
                  </span>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null

  return (
    <div ref={ref} className="relative">
      <div className="flex gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          className="scanner-trigger erpnext-btn-secondary"
          onClick={() => fileRef.current?.click()}
          aria-label="Open camera"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </button>
        {showTorch && (
          <button
            type="button"
            className={`erpnext-btn-secondary ${torchOn ? 'btn-amber' : ''}`}
            onClick={toggleTorch}
            aria-label="Toggle torch"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18h6M10 22h4M12 2v1M4.2 4.2l.7.7M1 12h1M4.2 19.8l.7-.7M19.8 19.8l-.7-.7M23 12h-1M19.8 4.2l-.7.7" />
              <path d="M15 9.354a4 4 0 1 0-5.646 5.646" />
            </svg>
          </button>
        )}
        <input
          ref={inputRef}
          className="scanner-field erpnext-input flex-1"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (filtered.length > 0 && open) {
                handleSelectSuggestion(filtered[0].code)
              } else {
                handleManualSubmit()
              }
            }
            if (e.key === 'Escape') setOpen(false)
          }}
        />
        <button
          type="button"
          className="erpnext-btn-primary"
          onClick={handleManualSubmit}
        >
          Enter
        </button>
      </div>
      {menu}
    </div>
  )
}