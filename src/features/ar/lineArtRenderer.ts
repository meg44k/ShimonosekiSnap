export function quantizeTime(elapsedMs: number, hz: number): number {
  return Math.floor((elapsedMs / 1000) * hz)
}

export interface RenderTargetSize {
  width: number
  height: number
}

export function resolveRenderTargetSize(
  cssWidth: number,
  cssHeight: number,
  pixelRatio: number,
  options: { maxPixelRatio?: number; scale?: number } = {},
): RenderTargetSize {
  const { maxPixelRatio = 2, scale = 1 } = options
  const ratio = Math.min(pixelRatio, maxPixelRatio) * scale
  return {
    width: Math.max(1, Math.round(cssWidth * ratio)),
    height: Math.max(1, Math.round(cssHeight * ratio)),
  }
}
