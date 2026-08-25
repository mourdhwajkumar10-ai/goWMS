// @vitest-environment node
import { describe, expect, it, beforeEach } from 'vitest'
import { setDeviceOverride } from '../utils/deviceDetect'
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
})
