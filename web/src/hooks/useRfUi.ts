import { useEffect, useState } from 'react'
import { getEffectiveShell } from '../utils/shellMode'

/** True for Floor shell or narrow viewports — use ScannerLayout RF UI instead of desk tables. */
export function useRfUi(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const onChange = () => setNarrow(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return getEffectiveShell() === 'floor' || narrow
}
