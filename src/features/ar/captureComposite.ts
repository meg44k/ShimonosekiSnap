export function captureComposite(
  video: HTMLVideoElement,
  overlayCanvas: HTMLCanvasElement,
  createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas'),
): string {
  const canvas = createCanvas()
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('2D context is not available')
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  ctx.drawImage(overlayCanvas, 0, 0, canvas.width, canvas.height)

  return canvas.toDataURL('image/png')
}
