// @vitest-environment node

import { describe, expect, it, beforeEach } from 'vitest'
import {
  storePermissions,
  storeDevicePolicy,
  storeWarehouseIds,
  getPermissions,
  getDevicePolicy,
  getWarehouseIds,
  hasPermission,
  canUseDevice,
  canAccessWarehouse,
  clearPermissions,
} from '../utils/permissions'

// Reset storage before each test.
function resetStorage() {
  const store = new Map<string, string>();
  // @ts-ignore
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (_i: number) => null,
  };
}

describe('permission persistence', () => {
  beforeEach(resetStorage)

  it('stores and retrieves permissions', () => {
    storePermissions(['receiving.view', 'receiving.scan_box'])
    expect(getPermissions()).toEqual(['receiving.view', 'receiving.scan_box'])
  })

  it('returns empty for missing permissions', () => {
    expect(getPermissions()).toEqual([])
  })

  it('clears permissions on undefined', () => {
    storePermissions(['receiving.view'])
    storePermissions(undefined)
    expect(getPermissions()).toEqual([])
  })

  it('clears permissions on empty array', () => {
    storePermissions(['receiving.view'])
    storePermissions([])
    expect(getPermissions()).toEqual([])
  })
})

describe('device policy', () => {
  beforeEach(resetStorage)

  it('stores and retrieves device policy', () => {
    storeDevicePolicy({ desktop: true, handheld: true, camera: true })
    expect(getDevicePolicy()).toEqual({ desktop: true, handheld: true, camera: true })
  })

  it('returns null for missing device policy', () => {
    expect(getDevicePolicy()).toBeNull()
  })

  it('canUseDevice respects desktop flag', () => {
    storeDevicePolicy({ desktop: true, handheld: false, camera: false })
    expect(canUseDevice('desktop')).toBe(true)
    expect(canUseDevice('handheld')).toBe(false)
  })
})

describe('warehouse IDs', () => {
  beforeEach(resetStorage)

  it('stores and retrieves warehouse IDs', () => {
    storeWarehouseIds([1, 2, 3])
    expect(getWarehouseIds()).toEqual([1, 2, 3])
  })

  it('canAccessWarehouse checks membership', () => {
    storeWarehouseIds([1, 2])
    expect(canAccessWarehouse(1)).toBe(true)
    expect(canAccessWarehouse(3)).toBe(false)
  })

  it('canAccessWarehouse returns true when unscoped', () => {
    expect(canAccessWarehouse(5)).toBe(true)
  })
})

describe('clearPermissions', () => {
  beforeEach(resetStorage)

  it('clears all permission data', () => {
    storePermissions(['receiving.view'])
    storeDevicePolicy({ desktop: true, handheld: false, camera: false })
    storeWarehouseIds([1])
    clearPermissions()
    expect(getPermissions()).toEqual([])
    expect(getDevicePolicy()).toBeNull()
    expect(getWarehouseIds()).toEqual([])
  })
})

describe('hasPermission', () => {
  beforeEach(resetStorage)

  it('returns true for stored permission', () => {
    storePermissions(['receiving.view', 'receiving.scan_box'])
    expect(hasPermission('receiving.view')).toBe(true)
    expect(hasPermission('receiving.scan_box')).toBe(true)
  })

  it('returns false for missing permission', () => {
    storePermissions(['receiving.view'])
    expect(hasPermission('receiving.approve')).toBe(false)
  })

  it('returns true for wildcard permission', () => {
    storePermissions(['*'])
    expect(hasPermission('anything.random')).toBe(true)
  })

  it('falls back to permissive mode with no permissions stored', () => {
    // No permissions stored — compat mode allows all auth'd users
    expect(hasPermission('anything')).toBe(true)
  })
})