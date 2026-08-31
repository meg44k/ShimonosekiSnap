// 夜景写真の「実際の光の位置」を輝度画像から抽出する純粋ロジック。
// 抽出した点に加算グロースプライトを置くことで、写真の JPEG ピクセルを
// そのまま光らせる(=チープでにじむ)のを避け、解像度非依存で
// クリアな発光を得る。DOM から輝度を読む処理は buildDiorama 側にあり、
// ここには数値配列 → 点リストの決定的な変換だけを置く。

export interface LightPoint {
  /** 画像 UV(u: 左0→右1) */
  u: number
  /** 画像 UV(v: 上0→下1) */
  v: number
  /** 元セルの輝度 0..1 */
  intensity: number
}

export interface ExtractOptions {
  /** この輝度未満のセルは無視する。既定 0.6 */
  threshold?: number
  /** 非最大抑制の半径(セル単位)。既定 3 */
  suppressionRadius?: number
  /** 返す点の最大数(明るい順)。既定 400 */
  maxPoints?: number
}

/**
 * 行優先の輝度グリッド(0..1)から、局所的に最も明るい点を抽出する。
 * 手順: しきい値以上かつ 8 近傍以上に明るいセルを候補に取り、
 * 明るい順に貪欲選択して suppressionRadius 内の重複を捨てる。
 */
export function extractLightPoints(
  luma: ArrayLike<number>,
  width: number,
  height: number,
  options: ExtractOptions = {},
): LightPoint[] {
  const threshold = options.threshold ?? 0.6
  const suppressionRadius = options.suppressionRadius ?? 3
  const maxPoints = options.maxPoints ?? 400

  if (width <= 0 || height <= 0 || luma.length < width * height) return []

  const at = (x: number, y: number) => luma[y * width + x]

  interface Candidate {
    x: number
    y: number
    intensity: number
  }
  const candidates: Candidate[] = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = at(x, y)
      if (value < threshold) continue
      let isPeak = true
      for (let dy = -1; dy <= 1 && isPeak; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          if (at(nx, ny) > value) {
            isPeak = false
            break
          }
        }
      }
      if (isPeak) candidates.push({ x, y, intensity: value })
    }
  }

  candidates.sort((a, b) => b.intensity - a.intensity)

  const accepted: Candidate[] = []
  const r2 = suppressionRadius * suppressionRadius
  for (const candidate of candidates) {
    if (accepted.length >= maxPoints) break
    let tooClose = false
    for (const kept of accepted) {
      const dx = kept.x - candidate.x
      const dy = kept.y - candidate.y
      if (dx * dx + dy * dy <= r2) {
        tooClose = true
        break
      }
    }
    if (!tooClose) accepted.push(candidate)
  }

  return accepted.map((c) => ({
    u: (c.x + 0.5) / width,
    v: (c.y + 0.5) / height,
    intensity: c.intensity,
  }))
}

/**
 * RGBA バイト配列(Canvas の getImageData 相当)を知覚輝度グリッド(0..1)へ。
 * Rec.601 の係数。buildDiorama がデコード画像から呼ぶ。
 */
export function rgbaToLuma(rgba: ArrayLike<number>, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4] / 255
    const g = rgba[i * 4 + 1] / 255
    const b = rgba[i * 4 + 2] / 255
    out[i] = 0.299 * r + 0.587 * g + 0.114 * b
  }
  return out
}
