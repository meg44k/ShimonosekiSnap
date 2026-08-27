import { describe, expect, it, vi } from 'vitest'
import { captureComposite } from './captureComposite'

describe('captureComposite', () => {
  it('crops the video to match the overlay canvas aspect ratio (cover fit) and draws it under the overlay', () => {
    const drawImage = vi.fn()
    const toDataURL = vi.fn().mockReturnValue('data:image/png;base64,FAKE')
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toDataURL,
    }
    const video = { videoWidth: 640, videoHeight: 480 } as unknown as HTMLVideoElement
    const overlayCanvas = { width: 640, height: 480 } as unknown as HTMLCanvasElement

    const result = captureComposite(video, overlayCanvas, () => fakeCanvas as unknown as HTMLCanvasElement)

    expect(fakeCanvas.width).toBe(640)
    expect(fakeCanvas.height).toBe(480)
    // Same aspect ratio (4:3 video, 4:3 overlay) -> no cropping, full frame used.
    expect(drawImage).toHaveBeenNthCalledWith(1, video, 0, 0, 640, 480, 0, 0, 640, 480)
    expect(drawImage).toHaveBeenNthCalledWith(2, overlayCanvas, 0, 0, 640, 480)
    expect(result).toBe('data:image/png;base64,FAKE')
  })

  it('center-crops a wider video (e.g. 16:9) to the overlay canvas aspect ratio instead of stretching it', () => {
    const drawImage = vi.fn()
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toDataURL: () => 'data:image/png;base64,FAKE',
    }
    // 1920x1080 (16:9) video captured, but the overlay/output is 640x480 (4:3).
    const video = { videoWidth: 1920, videoHeight: 1080 } as unknown as HTMLVideoElement
    const overlayCanvas = { width: 640, height: 480 } as unknown as HTMLCanvasElement

    captureComposite(video, overlayCanvas, () => fakeCanvas as unknown as HTMLCanvasElement)

    // scale = max(640/1920, 480/1080) = 480/1080 = 4/9
    // sw = 640 / (4/9) = 1440, sh = 480 / (4/9) = 1080
    // sx = (1920 - 1440) / 2 = 240, sy = (1080 - 1080) / 2 = 0
    expect(drawImage).toHaveBeenNthCalledWith(1, video, 240, 0, 1440, 1080, 0, 0, 640, 480)
  })

  it('throws when a 2D context is unavailable', () => {
    const fakeCanvas = { width: 0, height: 0, getContext: () => null, toDataURL: () => '' }
    const video = { videoWidth: 640, videoHeight: 480 } as unknown as HTMLVideoElement
    const overlayCanvas = { width: 640, height: 480 } as unknown as HTMLCanvasElement

    expect(() =>
      captureComposite(video, overlayCanvas, () => fakeCanvas as unknown as HTMLCanvasElement),
    ).toThrow('2D context is not available')
  })
})
