import { useCallback, useLayoutEffect, useRef, useState } from 'react'

export type AnchorRect = { top: number; left: number; width: number }

/**
 * Positions a portalled dropdown directly under an anchor element using fixed
 * coordinates. Rendering in a portal avoids clipping when the anchor lives
 * inside a container with `overflow` (e.g. horizontally scrolling tables),
 * and tracking scroll/resize keeps the menu aligned as the page moves.
 */
export function useAnchoredMenu(open: boolean, deps: unknown[] = []) {
  const anchorRef = useRef<HTMLElement | null>(null)
  const [rect, setRect] = useState<AnchorRect | null>(null)

  const reposition = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.max(r.width, 240)
    const maxLeft = Math.max(8, window.innerWidth - width - 8)
    setRect({ top: r.bottom + 4, left: Math.min(r.left, maxLeft), width })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    reposition()
    const onMove = () => reposition()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reposition, ...deps])

  return { anchorRef, rect, reposition }
}
