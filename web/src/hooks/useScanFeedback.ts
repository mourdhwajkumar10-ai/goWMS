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
  if (navigator.vibrate) navigator.vibrate(pattern)
}

// Combined — beep + vibrate
export function ping(freq = 800, dur = 0.12, buzzMs: number | number[] = 10) {
  beep(freq, dur)
  buzz(buzzMs)
}

// Error feedback
export function errPing() { ping(250, 0.35, [80, 50, 80]) }

// Hook version for React
export function useScanFeedback() {
  return {
    ok: useCallback(() => ping(880, 0.1, 10), []),
    warn: useCallback(() => ping(440, 0.2, 40), []),
    err: useCallback(() => errPing(), []),
    click: useCallback(() => buzz(8), []),
  }
}