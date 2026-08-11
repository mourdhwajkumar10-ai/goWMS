/** Offline scan queue — localStorage buffered ops flushed when online. */
const KEY = 'gowms_offline_scans'

export type OfflineScan = {
  id: string
  path: string
  body: unknown
  createdAt: string
}

export function enqueueScan(path: string, body: unknown) {
  const q = listScans()
  q.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, path, body, createdAt: new Date().toISOString() })
  localStorage.setItem(KEY, JSON.stringify(q.slice(-200)))
}

export function listScans(): OfflineScan[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

export function clearScans() {
  localStorage.removeItem(KEY)
}

export async function flushScans(post: (path: string, body: unknown) => Promise<{ ok: boolean; error?: string }>) {
  if (!navigator.onLine) return { flushed: 0, remaining: listScans().length }
  const q = listScans()
  const left: OfflineScan[] = []
  let flushed = 0
  for (const item of q) {
    const r = await post(item.path, item.body)
    if (r.ok) flushed++
    else left.push(item)
  }
  localStorage.setItem(KEY, JSON.stringify(left))
  return { flushed, remaining: left.length }
}
