const KEY = 'gowms_device'

/** True when the user is on a handheld device (Android phone, Zebra scanner, etc.).
 *  Criteria: touch-enabled AND viewport ≤ 1024px wide.
 *  Cached in localStorage so orientation changes don't flip the UI. */
export function isHandheld(): boolean {
  const cached = localStorage.getItem(KEY)
  if (cached != null) return cached === 'handheld'

  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 1
  const narrow = window.matchMedia('(max-width: 1024px)').matches
  const result = touch && narrow
  localStorage.setItem(KEY, result ? 'handheld' : 'desk')
  return result
}

/** Force-override (useful for testing from a desktop browser with devtools mobile emulation).
 *  Pass null to clear and re-detect on next isHandheld() call. */
export function setDeviceOverride(v: 'handheld' | 'desk' | null) {
  if (v == null) localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, v)
}