import { describe, expect, it, vi } from 'vitest'
import { captureComposite } from './captureComposite'

describe('captureComposite', () => {
  it('draws the video frame then the overlay canvas onto a canvas sized to the video, and returns a data URL', () => {
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
    expect(drawImage).toHaveBeenNthCalledWith(1, video, 0, 0, 640, 480)
    expect(drawImage).toHaveBeenNthCalledWith(2, overlayCanvas, 0, 0, 640, 480)
    expect(result).toBe('data:image/png;base64,FAKE')
  })

  it('throws when a 2D context is unavailable', () => {
    const fakeCanvas = { width: 0, height: 0, getContext: () => null, toDataURL: () => '' }
    const video = { videoWidth: 640, videoHeight: 480 } as unknown as HTMLVideoElement
    const overlayCanvas = {} as unknown as HTMLCanvasElement

    expect(() =>
      captureComposite(video, overlayCanvas, () => fakeCanvas as unknown as HTMLCanvasElement),
    ).toThrow('2D context is not available')
  })
})
