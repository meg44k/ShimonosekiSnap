/**
 * カメラ映像(video)とエフェクト描画(overlayCanvas)を 1 枚に合成して ctx へ描く。
 * 写真(captureComposite)と動画(recordComposite)で共有する。
 *
 * overlayCanvas は MindAR/顔フィルタがコンテナサイズに合わせて作るので、生の
 * カメラフレームとアスペクト比が違う。video は中央クロップ(cover)で合わせる。
 */
export function drawComposite(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  overlayCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  isMirror: boolean = false,
): void {
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight)
  const sw = width / scale
  const sh = height / scale
  const sx = (video.videoWidth - sw) / 2
  const sy = (video.videoHeight - sh) / 2

  ctx.save()
  if (isMirror) {
    ctx.translate(width, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height)
  ctx.restore()

  ctx.drawImage(overlayCanvas, 0, 0, width, height)
}

export function captureComposite(
  video: HTMLVideoElement,
  overlayCanvas: HTMLCanvasElement,
  isMirror: boolean = false,
  createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas'),
): string {
  const canvas = createCanvas()
  canvas.width = overlayCanvas.width
  canvas.height = overlayCanvas.height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('2D context is not available')
  }

  drawComposite(ctx, video, overlayCanvas, canvas.width, canvas.height, isMirror)

  return canvas.toDataURL('image/png')
}
