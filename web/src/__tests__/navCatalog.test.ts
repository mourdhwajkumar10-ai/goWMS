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
    expect(paths).not.toContain('/roles')
  })
})

describe('listDeskNavItems', () => {
  it('supervisor without permissions list does not see roles or employees', () => {
    const paths = listDeskNavItems('supervisor', []).map(t => t.to)
    expect(paths).not.toContain('/roles')
    expect(paths).not.toContain('/employees')
    expect(paths).toContain('/exceptions')
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
})
