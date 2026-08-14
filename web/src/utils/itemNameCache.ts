/** In-memory + sessionStorage map of item code → name for scan confirm UI.
 *  Session storage is per-tab and avoids a network round-trip on every QR scan. */
const KEY = 'gowms_item_names'
const MAX = 2500

type Cache = Record<string, string>

let mem: Cache | null = null

function norm(code: string) {
  return (code || '').trim().toUpperCase()
}

function load(): Cache {
  if (mem) return mem
  try {
    mem = JSON.parse(sessionStorage.getItem(KEY) || '{}') as Cache
  } catch {
    mem = {}
  }
  return mem
}

function persist() {
  if (!mem) return
  try {
    const keys = Object.keys(mem)
    if (keys.length > MAX) {
      mem = Object.fromEntries(keys.slice(keys.length - MAX).map(k => [k, mem![k]]))
    }
    sessionStorage.setItem(KEY, JSON.stringify(mem))
  } catch {
    /* quota / private mode */
  }
}

export function rememberItemName(code: string, name?: string | null) {
  const c = norm(code)
  const n = (name || '').trim()
  if (!c || !n) return
  load()[c] = n
  persist()
}

export function lookupItemName(code: string): string {
  return load()[norm(code)] || ''
}

export function rememberItems(rows?: Array<{
  item_code?: string
  code?: string
  part_no?: string
  item_name?: string
  name?: string
}> | null) {
  for (const r of rows || []) {
    rememberItemName(r.item_code || r.code || r.part_no || '', r.item_name || r.name)
  }
}
