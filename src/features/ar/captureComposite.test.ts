import { describe, expect, it, vi } from 'vitest'
import { captureComposite } from './captureComposite'

describe('captureComposite', () => {
  it('crops the video to match the overlay canvas aspect ratio (cover fit) and draws it under the overlay', () => {
    const drawImage = vi.fn()
    const toDataURL = vi.fn().mockReturnValue('data:image/png;base64,FAKE')
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage,
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
      }),
      toDataURL,
    }
    const video = { videoWidth: 640, videoHeight: 480 } as unknown as HTMLVideoElement
    const overlayCanvas = { width: 640, height: 480 } as unknown as HTMLCanvasElement

    const result = captureComposite(video, overlayCanvas, false, () => fakeCanvas as unknown as HTMLCanvasElement)

    expect(fakeCanvas.width).toBe(640)
    expect(fakeCanvas.height).toBe(480)
    expect(drawImage).toHaveBeenNthCalledWith(1, video, 0, 0, 640, 480, 0, 0, 640, 480)
    expect(drawImage).toHaveBeenNthCalledWith(2, overlayCanvas, 0, 0, 640, 480)
    expect(result).toBe('data:image/png;base64,FAKE')
  })

  it('mirrors the video when isMirror is true', () => {
    const drawImage = vi.fn()
    const translate = vi.fn()
    const scaleFn = vi.fn()
    const save = vi.fn()
    const restore = vi.fn()
    const toDataURL = vi.fn().mockReturnValue('data:image/png;base64,FAKE')
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage,
        save,
        restore,
        translate,
        scale: scaleFn,
      }),
      toDataURL,
    }
    const video = { videoWidth: 640, videoHeight: 480 } as unknown as HTMLVideoElement
    const overlayCanvas = { width: 640, height: 480 } as unknown as HTMLCanvasElement

    captureComposite(video, overlayCanvas, true, () => fakeCanvas as unknown as HTMLCanvasElement)

    expect(save).toHaveBeenCalled()
    expect(translate).toHaveBeenCalledWith(640, 0)
    expect(scaleFn).toHaveBeenCalledWith(-1, 1)
    expect(restore).toHaveBeenCalled()
  })

  it('center-crops a wider video (e.g. 16:9) to the overlay canvas aspect ratio instead of stretching it', () => {
    const drawImage = vi.fn()
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage,
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
      }),
      toDataURL: () => 'data:image/png;base64,FAKE',
    }
    const video = { videoWidth: 1920, videoHeight: 1080 } as unknown as HTMLVideoElement
    const overlayCanvas = { width: 640, height: 480 } as unknown as HTMLCanvasElement

    captureComposite(video, overlayCanvas, false, () => fakeCanvas as unknown as HTMLCanvasElement)

    expect(drawImage).toHaveBeenNthCalledWith(1, video, 240, 0, 1440, 1080, 0, 0, 640, 480)
  })

  it('throws when a 2D context is unavailable', () => {
    const fakeCanvas = { width: 0, height: 0, getContext: () => null, toDataURL: () => '' }
    const video = { videoWidth: 640, videoHeight: 480 } as unknown as HTMLVideoElement
    const overlayCanvas = { width: 640, height: 480 } as unknown as HTMLCanvasElement

    expect(() =>
      captureComposite(video, overlayCanvas, false, () => fakeCanvas as unknown as HTMLCanvasElement),
    ).toThrow('2D context is not available')
  })
})
