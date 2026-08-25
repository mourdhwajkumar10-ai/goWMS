// @vitest-environment node
import { describe, expect, it, beforeEach } from 'vitest'
import {
  getDeviceOverride,
  isHandheld,
  setDeviceOverride,
} from '../utils/deviceDetect'
import { getEffectiveShell, canSwitchToShell } from '../utils/shellMode'
import { storeDevicePolicy, clearPermissions } from '../utils/permissions'

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
  setDeviceOverride(null)
})

describe('device override vs auto cache', () => {
  it('getDeviceOverride ignores auto-detect cache', () => {
    localStorage.setItem('gowms_device', 'handheld')
    expect(getDeviceOverride()).toBeNull()
    expect(isHandheld()).toBe(true)
  })

  it('setDeviceOverride writes override key only', () => {
    localStorage.setItem('gowms_device', 'desk')
    setDeviceOverride('handheld')
    expect(localStorage.getItem('gowms_device_override')).toBe('handheld')
    expect(localStorage.getItem('gowms_device')).toBe('desk')
    expect(getDeviceOverride()).toBe('handheld')
    expect(isHandheld()).toBe(true)
  })

  it('clearing override leaves auto cache and restores auto path', () => {
    localStorage.setItem('gowms_device', 'desk')
    setDeviceOverride('handheld')
    setDeviceOverride(null)
    expect(getDeviceOverride()).toBeNull()
    expect(localStorage.getItem('gowms_device')).toBe('desk')
    expect(isHandheld()).toBe(false)
  })
})

describe('getEffectiveShell / canSwitchToShell', () => {
  it('override handheld forces floor shell', () => {
    setDeviceOverride('handheld')
    expect(getEffectiveShell()).toBe('floor')
  })

  it('override desk forces desk shell', () => {
    setDeviceOverride('desk')
    expect(getEffectiveShell()).toBe('desk')
  })

  it('blocks floor when device_policy.handheld is false', () => {
    storeDevicePolicy({ desktop: true, handheld: false, camera: false })
    setDeviceOverride('handheld')
    expect(canSwitchToShell('floor')).toBe(false)
    expect(getEffectiveShell()).toBe('desk')
  })

  it('blocks desk when device_policy.desktop is false', () => {
    storeDevicePolicy({ desktop: false, handheld: true, camera: false })
    setDeviceOverride('desk')
    expect(canSwitchToShell('desk')).toBe(false)
    expect(getEffectiveShell()).toBe('floor')
  })

  it('prefers desk when both device policies are blocked', () => {
    storeDevicePolicy({ desktop: false, handheld: false, camera: false })
    setDeviceOverride('handheld')
    expect(getEffectiveShell()).toBe('desk')
  })

  it('auto cache alone does not count as override for shell', () => {
    localStorage.setItem('gowms_device', 'handheld')
    expect(getDeviceOverride()).toBeNull()
    expect(getEffectiveShell()).toBe('floor')
  })
})
