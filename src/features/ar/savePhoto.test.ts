import { describe, expect, it, vi } from 'vitest'
import { dataUrlToBlob, savePhoto } from './savePhoto'

// 1x1 透明 PNG
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg=='

function fakeAnchor() {
  return {
    href: '',
    download: '',
    rel: '',
    click: vi.fn(),
  } as unknown as HTMLAnchorElement
}

describe('dataUrlToBlob', () => {
  it('decodes a base64 PNG data URL to a Blob with the right type and PNG signature', async () => {
    const blob = dataUrlToBlob(PNG_1PX)
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBeGreaterThan(0)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    // PNG magic number
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('decodes a non-base64 (URL-encoded) data URL', async () => {
    const blob = dataUrlToBlob('data:text/plain,hello%20world')
    expect(blob.type).toBe('text/plain')
    expect(await blob.text()).toBe('hello world')
  })

  it('rejects a string that is not a data URL', () => {
    expect(() => dataUrlToBlob('https://example.com/x.png')).toThrow()
  })
})

describe('savePhoto', () => {
  it('uses the native share sheet when files can be shared', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const anchor = fakeAnchor()
    const outcome = await savePhoto(PNG_1PX, 'snap.png', {
      navigator: { share, canShare: () => true },
      createAnchor: () => anchor,
    })
    expect(outcome).toBe('shared')
    expect(share).toHaveBeenCalledTimes(1)
    const shared = share.mock.calls[0][0] as ShareData
    expect(shared.files?.[0]).toBeInstanceOf(File)
    expect(shared.files?.[0].name).toBe('snap.png')
    expect(anchor.click).not.toHaveBeenCalled()
  })

  it('reports cancellation when the user dismisses the share sheet', async () => {
    const abort = Object.assign(new Error('dismissed'), { name: 'AbortError' })
    const share = vi.fn().mockRejectedValue(abort)
    const anchor = fakeAnchor()
    const outcome = await savePhoto(PNG_1PX, 'snap.png', {
      navigator: { share, canShare: () => true },
      createAnchor: () => anchor,
    })
    expect(outcome).toBe('cancelled')
    expect(anchor.click).not.toHaveBeenCalled()
  })

  it('falls back to a download when share fails for a non-abort reason', async () => {
    const share = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    const anchor = fakeAnchor()
    const outcome = await savePhoto(PNG_1PX, 'snap.png', {
      navigator: { share, canShare: () => true },
      createAnchor: () => anchor,
    })
    expect(outcome).toBe('downloaded')
    expect(anchor.click).toHaveBeenCalledTimes(1)
    expect(anchor.download).toBe('snap.png')
    expect(anchor.href).toBe(PNG_1PX)
  })

  it('downloads directly when the platform cannot share files (no canShare)', async () => {
    const share = vi.fn()
    const anchor = fakeAnchor()
    const outcome = await savePhoto(PNG_1PX, 'snap.png', {
      navigator: { share },
      createAnchor: () => anchor,
    })
    expect(outcome).toBe('downloaded')
    expect(share).not.toHaveBeenCalled()
    expect(anchor.click).toHaveBeenCalledTimes(1)
  })

  it('downloads directly when canShare rejects the file set', async () => {
    const share = vi.fn()
    const anchor = fakeAnchor()
    const outcome = await savePhoto(PNG_1PX, 'snap.png', {
      navigator: { share, canShare: () => false },
      createAnchor: () => anchor,
    })
    expect(outcome).toBe('downloaded')
    expect(share).not.toHaveBeenCalled()
    expect(anchor.click).toHaveBeenCalledTimes(1)
  })

  it('downloads when there is no navigator at all', async () => {
    const anchor = fakeAnchor()
    const outcome = await savePhoto(PNG_1PX, 'snap.png', {
      navigator: null,
      createAnchor: () => anchor,
    })
    expect(outcome).toBe('downloaded')
    expect(anchor.click).toHaveBeenCalledTimes(1)
  })
})
