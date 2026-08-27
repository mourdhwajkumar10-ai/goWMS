'use client'

import type { Box } from './box-queue'

type ItemsPanelProps = {
  boxes: Box[]
}

export function ItemsPanel({ boxes }: ItemsPanelProps) {
  const counted = boxes.filter((b) => b.status === 'counted')
  const damaged = boxes.filter((b) => b.status === 'damaged')
  const flagged = boxes.filter((b) => b.status === 'flagged')

  const units = (list: Box[]) => list.reduce((sum, b) => sum + b.units, 0)
  const expected = units(boxes)
  const received = units(counted)

  return (
    <section className="flex flex-col gap-2 px-4">
      <Row label="Expected units" value={expected} />
      <Row label="Received" value={received} tone="accent" />
      <Row label="Damaged" value={units(damaged)} tone="destructive" />
      <Row label="Rejected" value={units(flagged)} tone="destructive" />
      <Row label="Short" value={expected - received} />
    </section>
  )
}

function Row({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'accent' | 'destructive'
}) {
  const color =
    tone === 'accent' ? 'text-accent' : tone === 'destructive' ? 'text-destructive' : 'text-foreground'

  return (
    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-card px-4 py-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-2xl font-semibold leading-none tabular-nums ${color}`}>{value}</span>
    </div>
  )
}
