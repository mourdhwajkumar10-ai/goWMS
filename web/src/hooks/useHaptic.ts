import { useCallback } from 'react'

export function useHaptic() {
  const trigger = useCallback((ms = 10) => {
    navigator.vibrate?.(ms)
  }, [])
  return trigger
}
