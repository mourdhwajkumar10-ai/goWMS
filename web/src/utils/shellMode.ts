import { getDeviceOverride, isHandheld } from './deviceDetect'
import { canUseDevice } from './permissions'

export type ShellKind = 'floor' | 'desk'

/** Whether the user may select this presentation shell under device_policy. */
export function canSwitchToShell(shell: ShellKind): boolean {
  if (shell === 'floor') return canUseDevice('handheld')
  return canUseDevice('desktop')
}

/**
 * Resolve Floor vs Desk shell from override / auto-detect, then clamp by device_policy.
 * If both shells are blocked, prefer desk (edge case).
 */
export function getEffectiveShell(): ShellKind {
  const canFloor = canSwitchToShell('floor')
  const canDesk = canSwitchToShell('desk')

  const override = getDeviceOverride()
  let desired: ShellKind
  if (override === 'handheld') {
    desired = 'floor'
  } else if (override === 'desk') {
    desired = 'desk'
  } else {
    // Auto path: preserve isHandheld() cache-write behavior.
    desired = isHandheld() ? 'floor' : 'desk'
  }

  if (desired === 'floor' && !canFloor) {
    return 'desk'
  }
  if (desired === 'desk' && !canDesk) {
    return canFloor ? 'floor' : 'desk'
  }
  return desired
}
