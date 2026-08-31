import { useCallback, useRef } from 'react'

// Shared audio/haptic feedback for all scanner screens.
// Beeps are synthesized via Web Audio API — no audio files needed.

const getCtx = (() => {
  let ctx: AudioContext | null = null
  return () => {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  }
})()

export function beep(freq = 800, dur = 0.12, vol = 0.08) {
  try {
    const ctx = getCtx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(freq, ctx.currentTime)
    g.gain.setValueAtTime(vol, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + dur)
  } catch { /* ok */ }
}

export function buzz(pattern: number | number[] = 200) {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(pattern)
    }
  } catch { /* RF WebView may block without gesture */ }
}

// Short double-pulse — easier to feel on Zebra / Honeywell RF guns than a 10ms tick.
export const SCAN_OK_BUZZ: number[] = [80, 45, 80]
const OK_BUZZ = SCAN_OK_BUZZ
const WARN_BUZZ = 140
const ERR_BUZZ: number[] = [100, 55, 100, 55, 100]

// Combined — beep + vibrate
export function ping(freq = 800, dur = 0.12, buzzMs: number | number[] = OK_BUZZ) {
  beep(freq, dur)
  buzz(buzzMs)
}

// Error feedback
export function errPing() {
  ping(250, 0.35, ERR_BUZZ)
}

// Hook version for React
export function useScanFeedback() {
  return {
    ok: useCallback(() => ping(880, 0.1, OK_BUZZ), []),
    warn: useCallback(() => ping(440, 0.2, WARN_BUZZ), []),
    err: useCallback(() => errPing(), []),
    click: useCallback(() => buzz(12), []),
  }
}