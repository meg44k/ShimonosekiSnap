// レイヤーテクスチャを読み込み時に一度だけ色補正するための純粋な数式群。
// 実行時コストゼロで「映画的な階調」を作る。写真の JPEG を実行時に
// シェーダで持ち上げる方式(バンディング・にじみが出る)を避ける狙い。

export interface GradeParams {
  /** シャドウ持ち上げ(チャンネルごとに加算) */
  lift: [number, number, number]
  /** ミッドトーンのガンマ(>1 で中間を持ち上げ) */
  gamma: [number, number, number]
  /** ハイライトのゲイン(乗算) */
  gain: [number, number, number]
  /** 彩度。1 で変化なし、0 でグレースケール */
  saturation: number
  /** ACES 風フィルミックトーンマップを掛けるか */
  toneMap: boolean
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

// Narkowicz 2015 の ACES フィルミック近似
function acesFilmic(x: number): number {
  const a = 2.51
  const b = 0.03
  const c = 2.43
  const d = 0.59
  const e = 0.14
  return clamp01((x * (a * x + b)) / (x * (c * x + d) + e))
}

function gradeChannel(value: number, lift: number, gamma: number, gain: number): number {
  const scaled = clamp01(value * gain + lift)
  return Math.pow(scaled, 1 / gamma)
}

/** RGB(各 0..1)を 1 画素ぶん補正して返す */
export function gradePixel(
  r: number,
  g: number,
  b: number,
  p: GradeParams,
): [number, number, number] {
  let nr = gradeChannel(r, p.lift[0], p.gamma[0], p.gain[0])
  let ng = gradeChannel(g, p.lift[1], p.gamma[1], p.gain[1])
  let nb = gradeChannel(b, p.lift[2], p.gamma[2], p.gain[2])

  if (p.saturation !== 1) {
    const y = 0.299 * nr + 0.587 * ng + 0.114 * nb
    nr = y + (nr - y) * p.saturation
    ng = y + (ng - y) * p.saturation
    nb = y + (nb - y) * p.saturation
  }

  if (p.toneMap) {
    nr = acesFilmic(nr)
    ng = acesFilmic(ng)
    nb = acesFilmic(nb)
  }

  return [clamp01(nr), clamp01(ng), clamp01(nb)]
}

/** ImageData.data(RGBA バイト列)をその場で補正する。アルファは触らない */
export function gradeImageData(data: Uint8ClampedArray, p: GradeParams): void {
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = gradePixel(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, p)
    data[i] = Math.round(r * 255)
    data[i + 1] = Math.round(g * 255)
    data[i + 2] = Math.round(b * 255)
  }
}

/**
 * 火の山の夜景に使う調整済みの「ナイトグレード」。
 * シャドウをわずかに寒色へ(青リフト)、ハイライトを暖色へ(赤ゲイン)、
 * 中間をやや締めて彩度を少し落とし、最後に ACES で丸める。
 */
export const NIGHT_GRADE: GradeParams = {
  lift: [0.0, 0.008, 0.028],
  gamma: [0.92, 0.94, 1.0],
  gain: [1.08, 1.02, 0.96],
  saturation: 0.9,
  toneMap: true,
}
