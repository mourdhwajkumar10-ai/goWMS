// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { cameraErrorMessage } from '../utils/receivingData'
import type { CameraState } from '../utils/receivingData'

describe('camera state errors', () => {
  it('explains NotAllowedError', () => {
    expect(cameraErrorMessage('NotAllowedError')).toMatch(/permission/i)
    expect(cameraErrorMessage('PermissionDeniedError')).toMatch(/permission/i)
  })

  it('explains NotFoundError', () => {
    expect(cameraErrorMessage('NotFoundError')).toMatch(/camera/i)
  })

  it('explains SecurityError', () => {
    expect(cameraErrorMessage('SecurityError')).toMatch(/HTTPS|secure/i)
  })

  it('explains NotReadableError', () => {
    expect(cameraErrorMessage('NotReadableError')).toMatch(/busy|unavailable|camera apps/i)
  })

  it('explains NotSupportedError', () => {
    expect(cameraErrorMessage('NotSupportedError')).toMatch(/browser|camera/i)
  })

  it('explains NoMediaDevices', () => {
    expect(cameraErrorMessage('NoMediaDevices')).toMatch(/browser|camera/i)
  })

  it('provides a generic fallback', () => {
    const msg = cameraErrorMessage('UnknownError')
    expect(msg.length).toBeGreaterThan(0)
    expect(msg).toMatch(/could not start|camera/i)
  })

  it('handles undefined error name', () => {
    const msg = cameraErrorMessage(undefined)
    expect(msg.length).toBeGreaterThan(0)
  })
})

describe('CameraState type', () => {
  it('defines the expected states', () => {
    const states: CameraState[] = [
      'starting', 'ready', 'permission_denied',
      'no_camera', 'busy', 'unsupported', 'manual',
    ]
    expect(states).toHaveLength(7)
  })
})