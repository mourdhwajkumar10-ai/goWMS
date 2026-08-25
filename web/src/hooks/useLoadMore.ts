import { useEffect, useState } from 'react'

export const LOAD_MORE_PAGE_SIZE = 10

/**
 * Client-side progressive list: show first `pageSize` items, then reveal +pageSize on demand.
 * Pass `resetKey` when the underlying query/filter/tab changes so the window resets to page 1.
 */
export function useLoadMore<T>(items: T[], pageSize = LOAD_MORE_PAGE_SIZE, resetKey?: unknown) {
  const [visibleCount, setVisibleCount] = useState(pageSize)

  useEffect(() => {
    setVisibleCount(pageSize)
  }, [resetKey, pageSize])

  const visible = items.slice(0, visibleCount)
  const hasMore = visibleCount < items.length
  const remaining = Math.max(0, items.length - visibleCount)
  const loadMore = () => setVisibleCount((n) => n + pageSize)

  return {
    visible,
    hasMore,
    remaining,
    loadMore,
    visibleCount,
    setVisibleCount,
    pageSize,
    total: items.length,
  }
}

export type LoadMore = ReturnType<typeof useLoadMore>
