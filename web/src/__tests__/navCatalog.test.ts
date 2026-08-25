// @vitest-environment node
import { describe, expect, it, beforeEach } from 'vitest'
import { listDeskNavItems, listFloorTiles } from '../utils/navCatalog'
import { storePermissions, clearPermissions } from '../utils/permissions'

function resetStorage() {
  const store = new Map<string, string>()
  // @ts-ignore
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    get length() { return store.size },
    key: () => null,
  }
}

beforeEach(() => {
  resetStorage()
  clearPermissions()
})

describe('listFloorTiles', () => {
  it('picker sees pick-focused tiles only', () => {
    const tiles = listFloorTiles('picker', [])
    const paths = tiles.map(t => t.to)
    expect(paths).toContain('/pick')
    expect(paths).not.toContain('/pack')
    expect(paths).not.toContain('/employees')
  })

  it('supervisor on floor sees operational handheld tiles', () => {
    const paths = listFloorTiles('supervisor', []).map(t => t.to)
    expect(paths).toContain('/receiving')
    expect(paths).toContain('/putaway-runner')
    expect(paths).not.toContain('/putaway')
    expect(paths).not.toContain('/roles')
  })

  it('floor has a single Putaway tile (runner), not both wizard and runner', () => {
    const putawayTiles = listFloorTiles('supervisor', []).filter(
      (t) => t.to === '/putaway' || t.to === '/putaway-runner' || /putaway/i.test(t.label),
    )
    expect(putawayTiles).toHaveLength(1)
    expect(putawayTiles[0].to).toBe('/putaway-runner')
    expect(putawayTiles[0].label).toBe('Putaway')
  })
})

describe('listDeskNavItems', () => {
  it('supervisor without permissions list does not see roles or employees', () => {
    const paths = listDeskNavItems('supervisor', []).map(t => t.to)
    expect(paths).not.toContain('/roles')
    expect(paths).not.toContain('/employees')
    expect(paths).toContain('/exceptions')
  })

  it('desk Putaway is wizard path; Putaway Runner is not in sidebar', () => {
    const paths = listDeskNavItems('admin', []).map((t) => t.to)
    expect(paths).toContain('/putaway')
    expect(paths).not.toContain('/putaway-runner')
  })

  it('admin sees roles and employees', () => {
    const paths = listDeskNavItems('admin', []).map(t => t.to)
    expect(paths).toContain('/roles')
    expect(paths).toContain('/employees')
  })

  it('wm keeps employees but not roles', () => {
    const paths = listDeskNavItems('wm', []).map(t => t.to)
    expect(paths).toContain('/employees')
    expect(paths).not.toContain('/roles')
  })

  it('stored permissions gate masters manage', () => {
    storePermissions(['receiving.view', 'reports.view'])
    const paths = listDeskNavItems('wm', ['receiving.view', 'reports.view']).map(t => t.to)
    expect(paths).not.toContain('/items')
  })

  it('picker with inventory.view stays on picker desk allowlist', () => {
    storePermissions(['inventory.view'])
    const paths = listDeskNavItems('picker', ['inventory.view']).map(t => t.to)
    expect(paths).toContain('/pick')
    expect(paths).not.toContain('/pack')
    expect(paths).not.toContain('/items')
  })

  it('desk sidebar excludes floor-only paths and keeps section order', () => {
    const items = listDeskNavItems('admin', [])
    const paths = items.map((t) => t.to)
    expect(paths).not.toContain('/dock-receiving')
    expect(paths).not.toContain('/notifications')
    const sections = [...new Set(items.map((t) => t.section))]
    expect(sections).toEqual(['home', 'inbound', 'outbound', 'inventory', 'system'])
  })

  it('groups ops into inbound / outbound / inventory with system at end', () => {
    const items = listDeskNavItems('admin', [])
    const bySection = (id: string) => items.filter((t) => t.section === id).map((t) => t.to)
    expect(bySection('inbound')).toEqual(expect.arrayContaining(['/receiving', '/putaway', '/qi', '/po']))
    expect(bySection('outbound')).toEqual(expect.arrayContaining(['/pick', '/pack', '/dispatch']))
    expect(bySection('inventory')).toEqual(expect.arrayContaining(['/cycle-count', '/items', '/locations']))
    expect(bySection('system')).toEqual(expect.arrayContaining(['/employees', '/roles', '/reports']))
    expect(bySection('inbound')).not.toContain('/pick')
    expect(bySection('outbound')).not.toContain('/receiving')
  })
})

describe('qi floor tiles', () => {
  it('includes box verification', () => {
    const paths = listFloorTiles('qi', []).map(t => t.to)
    expect(paths).toContain('/box-verification')
  })

  it('places QI inbound tiles under inbound section', () => {
    const tiles = listFloorTiles('qi', [])
    const inbound = tiles.filter((t) => t.section === 'inbound').map((t) => t.to)
    expect(inbound).toEqual(expect.arrayContaining(['/receiving', '/box-verification', '/qi', '/exceptions']))
  })
})
