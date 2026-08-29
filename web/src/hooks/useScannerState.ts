import { useState, useCallback } from 'react'

export interface ScannerToast {
  id: number
  text: string
  type: 'ok' | 'warn' | 'err'
}

export interface BaseScannerState {
  cameraKey: number
  setCameraKey: (k: number) => void
  flash: 'success' | 'error' | null
  setFlash: (f: 'success' | 'error' | null) => void
  toasts: ScannerToast[]
  toast: (text: string, type: 'ok' | 'warn' | 'err') => void
  haptic: (ms: number) => void
  playBeep: (freq: number, dur: number) => void
  triggerVibrate: (p: number | number[]) => void
  scanState: 'idle' | 'accepted' | 'rejected'
  setScanState: (state: 'idle' | 'accepted' | 'rejected') => void
  scanReason: string | undefined
  setScanReason: (reason: string | undefined) => void
  lastScanCode: string
  setLastScanCode: (code: string) => void
}

const playBeep = (freq = 800, dur = 0.15) => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = freq
    g.gain.setValueAtTime(0.1, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + dur)
  } catch {}
}

const triggerVibrate = (p: number | number[] = 200) => {
  if (navigator.vibrate) navigator.vibrate(p)
}

export function useScannerState(): BaseScannerState {
  const [cameraKey, setCameraKey] = useState(0)
  const [flash, setFlash] = useState<'success' | 'error' | null>(null)
  const [toasts, setToasts] = useState<ScannerToast[]>([])
  const [scanState, setScanState] = useState<'idle' | 'accepted' | 'rejected'>('idle')
  const [scanReason, setScanReason] = useState<string | undefined>()
  const [lastScanCode, setLastScanCode] = useState('')

  const toast = useCallback((text: string, type: 'ok' | 'warn' | 'err' = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts(p => [...p.slice(-2), { id, text, type }])
    if (type === 'ok') playBeep(800, 0.15)
    else if (type === 'err') { playBeep(250, 0.4); triggerVibrate([100, 50, 100]); }
    else { playBeep(400, 0.25); triggerVibrate(150); }
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000)
  }, [])

  const haptic = useCallback((ms: number) => {
    triggerVibrate(ms)
  }, [])

  const doFlash = useCallback((t: 'success' | 'error') => { 
    setFlash(t); 
    setTimeout(() => setFlash(null), 300) 
  }, [])

  return {
    cameraKey,
    setCameraKey,
    flash,
    setFlash,
    toasts,
    toast,
    haptic,
    playBeep,
    triggerVibrate,
    scanState,
    setScanState,
    scanReason,
    setScanReason,
    lastScanCode,
    setLastScanCode,
  }
}