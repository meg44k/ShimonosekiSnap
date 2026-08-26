export function captureComposite(
  video: HTMLVideoElement,
  overlayCanvas: HTMLCanvasElement,
  createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas'),
): string {
  const canvas = createCanvas()
  canvas.width = overlayCanvas.width
  canvas.height = overlayCanvas.height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('2D context is not available')
  }

  // Cover-fit crop: the overlay canvas may have a different aspect ratio than
  // the raw video frame (MindAR sizes its canvas to the container, not the
  // camera's native resolution), so center-crop the video to match instead
  // of stretching it.
  const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight)
  const sw = canvas.width / scale
  const sh = canvas.height / scale
  const sx = (video.videoWidth - sw) / 2
  const sy = (video.videoHeight - sh) / 2

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  ctx.drawImage(overlayCanvas, 0, 0, canvas.width, canvas.height)

  return canvas.toDataURL('image/png')
}
