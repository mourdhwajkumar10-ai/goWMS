import { useCallback, useState } from 'react'

export type ScanJobStep =
  | { kind: 'location'; prompt: string; expected: string; lineId: number; itemCode: string; remaining: number }
  | { kind: 'item'; prompt: string; expected: string; lineId: number; itemCode: string; remaining: number; location: string }
  | { kind: 'done'; prompt: string }

export type ScanVerdictState = 'idle' | 'ok' | 'error' | 'blocked'

type Options = {
  onVerify: (step: ScanJobStep, scanned: string, qty: number) => Promise<{ ok: boolean; error?: string; advance?: boolean }>
}

/** Shared prompt → scan → verify → advance loop for pick / pack / consolidate / counter. */
export function useScanJob(initial: ScanJobStep | null, opts: Options) {
  const [step, setStep] = useState<ScanJobStep | null>(initial)
  const [verdict, setVerdict] = useState<ScanVerdictState>('idle')
  const [reason, setReason] = useState('')
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState(false)

  const resetVerdict = useCallback(() => {
    setVerdict('idle')
    setReason('')
  }, [])

  const setSequence = useCallback((next: ScanJobStep | null) => {
    setStep(next)
    setVerdict('idle')
    setReason('')
    if (next && (next.kind === 'location' || next.kind === 'item')) {
      setQty(Math.max(1, Math.floor(next.remaining || 1)))
    }
  }, [])

  const submitScan = useCallback(async (scanned: string) => {
    if (!step || step.kind === 'done' || busy) return
    const clean = String(scanned || '').trim()
    if (!clean) return
    setBusy(true)
    try {
      const res = await opts.onVerify(step, clean, qty)
      if (!res.ok) {
        setVerdict(res.error?.toLowerCase().includes('override') ? 'blocked' : 'error')
        setReason(res.error || 'Scan rejected')
        return
      }
      setVerdict('ok')
      setReason('')
    } finally {
      setBusy(false)
    }
  }, [step, busy, qty, opts])

  return {
    step,
    setSequence,
    verdict,
    reason,
    qty,
    setQty,
    busy,
    submitScan,
    resetVerdict,
  }
}
