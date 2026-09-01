import { afterEach, describe, expect, it, vi } from 'vitest'
import { isVideoRecordingSupported, pickVideoMimeType } from './recordComposite'

const g = globalThis as unknown as {
  MediaRecorder?: unknown
  HTMLCanvasElement?: unknown
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pickVideoMimeType', () => {
  it('returns null when MediaRecorder is unavailable', () => {
    vi.stubGlobal('MediaRecorder', undefined)
    expect(pickVideoMimeType()).toBeNull()
  })

  it('returns null when no candidate type is supported', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => false })
    expect(pickVideoMimeType()).toBeNull()
  })

  it('returns the first supported candidate (mp4 preferred over webm)', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (t: string) => t === 'video/mp4' || t.startsWith('video/webm'),
    })
    expect(pickVideoMimeType()).toBe('video/mp4')
  })

  it('falls back to webm when mp4 is unsupported', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (t: string) => t === 'video/webm;codecs=vp9',
    })
    expect(pickVideoMimeType()).toBe('video/webm;codecs=vp9')
  })
})

describe('isVideoRecordingSupported', () => {
  it('is false without MediaRecorder', () => {
    vi.stubGlobal('MediaRecorder', undefined)
    expect(isVideoRecordingSupported()).toBe(false)
  })

  it('is false when canvas.captureStream is missing even if a mime type works', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => true })
    // jsdom / node: HTMLCanvasElement may be undefined or lack captureStream
    const ok = isVideoRecordingSupported()
    const hasCapture =
      typeof g.HTMLCanvasElement !== 'undefined' &&
      typeof (g.HTMLCanvasElement as { prototype?: { captureStream?: unknown } }).prototype
        ?.captureStream === 'function'
    expect(ok).toBe(hasCapture)
  })
})
