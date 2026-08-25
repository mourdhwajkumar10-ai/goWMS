/** Persist which nav sections are expanded. Missing keys = expanded (default). */

const STORAGE_KEY = 'gowms_nav_sections'

export type SectionOpenMap = Record<string, boolean>

export function readSectionOpenMap(): SectionOpenMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as SectionOpenMap
  } catch {
    return {}
  }
}

export function writeSectionOpenMap(map: SectionOpenMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota / private mode */
  }
}

/** Default: all sections expanded on first visit. */
export function isSectionOpen(id: string, map: SectionOpenMap): boolean {
  return map[id] !== false
}

export function toggleSectionOpen(id: string, map: SectionOpenMap): SectionOpenMap {
  const next = { ...map, [id]: !isSectionOpen(id, map) }
  writeSectionOpenMap(next)
  return next
}

const SIDEBAR_KEY = 'gowms_sidebar_collapsed'
const LEGACY_NAV_KEY = 'gowms_nav'

export function readSidebarCollapsed(): boolean {
  try {
    const v = localStorage.getItem(SIDEBAR_KEY)
    if (v === '1' || v === 'true' || v === 'collapsed') return true
    if (v === '0' || v === 'false' || v === 'expanded') return false
    // Migrate legacy desk key
    return localStorage.getItem(LEGACY_NAV_KEY) === 'collapsed'
  } catch {
    return false
  }
}

export function writeSidebarCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded')
    localStorage.setItem(LEGACY_NAV_KEY, collapsed ? 'collapsed' : 'expanded')
  } catch {
    /* ignore */
  }
}
