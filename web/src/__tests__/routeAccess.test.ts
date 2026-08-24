// @vitest-environment node

import { describe, expect, it, beforeEach } from 'vitest'
import {
  storePermissions,
  storeDevicePolicy,
  hasPermission,
  canUseDevice,
  clearPermissions,
} from '../utils/permissions'

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

describe('receiving operator route access', () => {
  beforeEach(resetStorage)

  it('can reach RF receiving with scan permissions', () => {
    storePermissions(['receiving.view', 'receiving.scan_box', 'receiving.scan_item'])
    storeDevicePolicy({ desktop: false, handheld: true, camera: true })

    expect(hasPermission('receiving.view')).toBe(true)
    expect(hasPermission('receiving.scan_box')).toBe(true)
    expect(canUseDevice('handheld')).toBe(true)
  })

  it('cannot approve receiving', () => {
    storePermissions(['receiving.view', 'receiving.scan_box', 'receiving.scan_item'])
    expect(hasPermission('receiving.approve')).toBe(false)
  })

  it('cannot create POs', () => {
    storePermissions(['receiving.view', 'po.view'])
    expect(hasPermission('po.create')).toBe(false)
    expect(hasPermission('po.edit')).toBe(false)
  })
})

describe('billing role restrictions', () => {
  beforeEach(resetStorage)

  it('may not access scanner routes', () => {
    storePermissions(['po.view', 'reports.view', 'notifications.view'])
    storeDevicePolicy({ desktop: true, handheld: false, camera: false })

    expect(hasPermission('receiving.scan_box')).toBe(false)
    expect(hasPermission('receiving.scan_item')).toBe(false)
    expect(hasPermission('inventory.adjust')).toBe(false)
  })

  it('has desktop access only', () => {
    storePermissions(['reports.view', 'notifications.view'])
    storeDevicePolicy({ desktop: true, handheld: false, camera: false })

    expect(canUseDevice('desktop')).toBe(true)
    expect(canUseDevice('handheld')).toBe(false)
    expect(canUseDevice('camera')).toBe(false)
  })
})

describe('admin controls', () => {
  beforeEach(resetStorage)

  it('admin can manage roles and employees', () => {
    storePermissions(['*'])
    expect(hasPermission('roles.manage')).toBe(true)
    expect(hasPermission('employees.manage')).toBe(true)
  })

  it('admin has all devices', () => {
    storePermissions(['*'])
    storeDevicePolicy({ desktop: true, handheld: true, camera: true })

    expect(canUseDevice('desktop')).toBe(true)
    expect(canUseDevice('handheld')).toBe(true)
    expect(canUseDevice('camera')).toBe(true)
  })
})

describe('viewer restrictions', () => {
  beforeEach(resetStorage)

  it('can view but not mutate inventory', () => {
    storePermissions(['po.view', 'receiving.view', 'inventory.view', 'reports.view'])
    expect(hasPermission('inventory.view')).toBe(true)
    expect(hasPermission('inventory.adjust')).toBe(false)
  })

  it('cannot manage master data', () => {
    storePermissions(['po.view', 'inventory.view'])
    expect(hasPermission('masterdata.manage')).toBe(false)
  })
})

describe('non-admin hidden controls', () => {
  beforeEach(resetStorage)

  it('picker cannot see admin routes', () => {
    storePermissions(['picking.access', 'inventory.view', 'notifications.view'])
    expect(hasPermission('roles.manage')).toBe(false)
    expect(hasPermission('employees.manage')).toBe(false)
    expect(hasPermission('masterdata.manage')).toBe(false)
  })
})