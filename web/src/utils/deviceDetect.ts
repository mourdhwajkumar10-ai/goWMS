const KEY = 'gowms_device'
const OVERRIDE_KEY = 'gowms_device_override'

/** True when the user is on a handheld device (Android phone, Zebra scanner, etc.).
 *  Criteria: touch-enabled AND viewport ≤ 1024px wide.
 *  Explicit override (gowms_device_override) wins; otherwise auto-detect is cached in
 *  gowms_device so orientation changes don't flip the UI. */
export function isHandheld(): boolean {
  const override = localStorage.getItem(OVERRIDE_KEY)
  if (override === 'handheld' || override === 'desk') {
    return override === 'handheld'
  }

  const cached = localStorage.getItem(KEY)
  if (cached != null) return cached === 'handheld'

  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 1
  const narrow = window.matchMedia('(max-width: 1024px)').matches
  const result = touch && narrow
  localStorage.setItem(KEY, result ? 'handheld' : 'desk')
  return result
}

/** Read explicit Floor/Desk override only (not the auto-detect cache). */
export function getDeviceOverride(): 'handheld' | 'desk' | null {
  const v = localStorage.getItem(OVERRIDE_KEY)
  if (v === 'handheld' || v === 'desk') return v
  return null
}

/** Force-override (useful for Floor/Desk switch or testing).
 *  Pass null to clear override and fall back to auto-detect cache / re-detect. */
export function setDeviceOverride(v: 'handheld' | 'desk' | null) {
  if (v == null) localStorage.removeItem(OVERRIDE_KEY)
  else localStorage.setItem(OVERRIDE_KEY, v)
}
