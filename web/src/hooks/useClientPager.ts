import { useEffect, useMemo, useState } from 'react'

export const PAGE_SIZE = 50

function rowText(row: unknown): string {
  if (row == null) return ''
  if (typeof row !== 'object') return String(row)
  return Object.values(row as Record<string, unknown>)
    .filter((v) => v != null && typeof v !== 'object')
    .join(' ')
}

export function useClientPager<T>(rows: T[], textOf?: (row: T) => string) {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((row) => {
      const blob = textOf ? textOf(row) : rowText(row)
      return blob.toLowerCase().includes(s)
    })
  }, [rows, q])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  useEffect(() => {
    if (page > pages) setPage(pages)
  }, [page, pages])

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const from = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, filtered.length)

  const setQuery = (value: string) => {
    setQ(value)
    setPage(1)
  }

  return {
    q,
    setQ: setQuery,
    page,
    setPage,
    pages,
    total: filtered.length,
    filtered,
    pageItems,
    pageSize: PAGE_SIZE,
    from,
    to,
  }
}

export type ClientPager = ReturnType<typeof useClientPager>
