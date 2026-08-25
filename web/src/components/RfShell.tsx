import type { ReactNode } from 'react'
import ScannerLayout, { useScannerToasts, ScannerToastBar } from './ScannerLayout'
import '../styles/scanner.css'

type Props = {
  title: string
  stat?: string
  statOf?: string
  meta?: string
  children: ReactNode
}

/** Shared RF page chrome for floor / narrow UIs. Route-level Back via ScannerLayout. */
export default function RfShell({ title, stat, statOf, meta, children }: Props) {
  const { toasts } = useScannerToasts()
  return (
    <ScannerLayout title={title} stat={stat} statOf={statOf} meta={meta}>
      <ScannerToastBar toasts={toasts} />
      {children}
    </ScannerLayout>
  )
}
