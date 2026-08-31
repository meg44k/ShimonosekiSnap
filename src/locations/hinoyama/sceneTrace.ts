// 火の山公園の夜景パネル(assets/hinoyama-base.jpg, 1280x853)から目視でトレースした
// 地物の座標データと、それを扱う純粋ヘルパー。座標はすべて画像 UV
// (u: 左0→右1 / v: 上0→下1)で記述する。初期見積もり値であり、印刷パネルを
// 使った実機確認で最終調整する前提(角島の WAYPOINTS と同じ運用)。

/** assets/hinoyama-base.jpg の実寸から算出したアスペクト比(高さ/幅) */
export const MARKER_ASPECT = 853 / 1280

/**
 * 画像 UV → マーカー座標。マーカー座標系は既存フレームワーク規約に合わせて
 * 「画像中心が原点・幅1・Y上・高さ = MARKER_ASPECT」。
 */
export function imageToMarker(u: number, v: number): [number, number] {
  return [u - 0.5, (0.5 - v) * MARKER_ASPECT]
}

/** 空のグラデーション停止色(y=0 が画面上端、y=1 が水平線)。実写の薄明を近似 */
export const SKY_GRADIENT_STOPS: readonly { y: number; color: string }[] = [
  { y: 0, color: '#0a1636' },
  { y: 0.45, color: '#1b2f5e' },
  { y: 0.72, color: '#5a4a78' },
  { y: 0.88, color: '#b07a7a' },
  { y: 1, color: '#d99f78' },
]

/** 海峡の流路(船が通る中心線)。画像UVの制御点、bottom付近 → 右奥の外海方向へ */
export const STRAIT_PATH: readonly (readonly [number, number])[] = [
  [0.31, 0.96],
  [0.36, 0.85],
  [0.44, 0.76],
  [0.56, 0.7],
  [0.7, 0.64],
  [0.86, 0.6],
]

/** 関門橋の桁 + 主塔のポリライン(左アンカー → 左主塔 → 中央 → 右主塔 → 右側) */
export const BRIDGE_PATH: readonly (readonly [number, number])[] = [
  [0.08, 0.72],
  [0.17, 0.66],
  [0.3, 0.7],
  [0.42, 0.715],
  [0.55, 0.66],
  [0.63, 0.71],
]

/** 右主塔上の航空障害灯(赤く明滅)の位置 */
export const BRIDGE_BEACON_UV: readonly [number, number] = [0.549, 0.632]

/** 街明かりの散布領域。warmth 0=白寄り(下関) / 1=琥珀寄り(北九州) */
export const CITY_LIGHT_REGIONS: readonly {
  polygon: readonly (readonly [number, number])[]
  warmth: number
}[] = [
  { polygon: [[0.02, 0.58], [0.42, 0.58], [0.42, 0.7], [0.02, 0.72]], warmth: 0.25 },
  { polygon: [[0.58, 0.55], [1, 0.53], [1, 0.64], [0.58, 0.66]], warmth: 0.8 },
]

/** 手前の道路(車のテールランプが流れる線)。画像UV */
export const FOREGROUND_ROAD_PATH: readonly (readonly [number, number])[] = [
  [0.58, 0.98],
  [0.63, 0.9],
  [0.7, 0.85],
  [0.8, 0.83],
]

/**
 * 流星の直線軌道(画像UV)。すべて空の領域(稜線 v≈0.45 より上)に収める。
 * `from` が出現点、`to` が消失点。斜めに落ちる向きで角度をばらす。
 */
export const METEOR_PATHS: readonly { from: readonly [number, number]; to: readonly [number, number] }[] = [
  { from: [0.12, 0.04], to: [0.34, 0.3] },
  { from: [0.28, 0.02], to: [0.44, 0.26] },
  { from: [0.46, 0.05], to: [0.3, 0.32] },
  { from: [0.62, 0.03], to: [0.78, 0.28] },
  { from: [0.78, 0.06], to: [0.6, 0.34] },
  { from: [0.9, 0.08], to: [0.72, 0.36] },
  { from: [0.2, 0.12], to: [0.4, 0.4] },
  { from: [0.54, 0.02], to: [0.66, 0.24] },
  { from: [0.7, 0.1], to: [0.88, 0.34] },
  { from: [0.36, 0.08], to: [0.2, 0.34] },
]

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  )
}

/** points を通る Catmull-Rom スプライン。t は経路全体で 0..1、端点は複製して延長 */
export function sampleSpline(
  points: readonly (readonly [number, number])[],
  t: number,
): [number, number] {
  if (points.length === 0) return [0, 0]
  if (points.length === 1) return [points[0][0], points[0][1]]
  const clamped = Math.min(Math.max(t, 0), 1)
  const segCount = points.length - 1
  const scaled = clamped * segCount
  let i = Math.floor(scaled)
  if (i >= segCount) i = segCount - 1
  const localT = scaled - i
  const p0 = points[i - 1 < 0 ? 0 : i - 1]
  const p1 = points[i]
  const p2 = points[i + 1]
  const p3 = points[i + 2 > points.length - 1 ? points.length - 1 : i + 2]
  return [
    catmullRom(p0[0], p1[0], p2[0], p3[0], localT),
    catmullRom(p0[1], p1[1], p2[1], p3[1], localT),
  ]
}

/** レイキャスト法の内外判定。境界上ちょうどの点の扱いは未定義 */
export function pointInPolygon(
  point: readonly [number, number],
  polygon: readonly (readonly [number, number])[],
): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

/** 決定的 PRNG (mulberry32)。返り値は [0,1) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
