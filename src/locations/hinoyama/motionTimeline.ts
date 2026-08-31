// 「動く夜景」の時間ロジック(純粋関数)。すべて elapsedMs だけに依存し、
// ArCameraView が onTargetFound でリセットする経過時間から駆動される
// (認識のたびにループが頭出しされる)。乱数・DOM・THREE を一切使わない。

/** ループ長。24 秒で全要素が一巡する */
export const CYCLE_MS = 24_000

function mod(a: number, m: number): number {
  return ((a % m) + m) % m
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/** 0→1→0 の滑らかな山(sin 半波)。端で 0、中央で 1 */
function hump(t: number): number {
  return Math.sin(Math.PI * clamp01(t))
}

// --- 船 ------------------------------------------------------------------

export interface BoatState {
  active: boolean
  /** STRAIT_PATH に沿った位置 0..1(0=手前の岸、1=右奥の外海) */
  t: number
  /** 進行方向。+1 = 外海へ、-1 = 外海から */
  dir: 1 | -1
  /** 見かけの大きさ 0..1(奥ほど小さい) */
  scale: number
  /** 不透明度 0..1(両端でフェード) */
  opacity: number
  /** スロット固有の安定シード(航跡のゆらぎ用) */
  seed: number
}

interface BoatSlot {
  startMs: number
  durationMs: number
  dir: 1 | -1
}

// 1 周期に 3 隻。時間差・両方向。crossing は 9.5〜11.5 秒。
const BOAT_SLOTS: readonly BoatSlot[] = [
  { startMs: 0, durationMs: 11_500, dir: 1 },
  { startMs: 7_200, durationMs: 9_500, dir: -1 },
  { startMs: 15_000, durationMs: 10_500, dir: 1 },
]

function boatAt(slot: BoatSlot, slotIndex: number, elapsedMs: number): BoatState {
  const seed = slotIndex * 1013 + 7
  const phase = mod(elapsedMs - slot.startMs, CYCLE_MS)
  if (phase > slot.durationMs) {
    return { active: false, t: 0, dir: slot.dir, scale: 0, opacity: 0, seed }
  }
  const p = phase / slot.durationMs
  const t = slot.dir === 1 ? p : 1 - p
  // 岸(t=0)で 0.9 → 外海(t=1)で 0.32
  const scale = 0.9 - 0.58 * t
  // 最初の 9% でフェードイン、最後の 14% でフェードアウト
  const fadeIn = clamp01(p / 0.09)
  const fadeOut = clamp01((1 - p) / 0.14)
  return { active: true, t, dir: slot.dir, scale, opacity: fadeIn * fadeOut, seed }
}

export function boats(elapsedMs: number): [BoatState, BoatState, BoatState] {
  return [
    boatAt(BOAT_SLOTS[0], 0, elapsedMs),
    boatAt(BOAT_SLOTS[1], 1, elapsedMs),
    boatAt(BOAT_SLOTS[2], 2, elapsedMs),
  ]
}

// --- 関門橋の航空障害灯(赤の明滅) --------------------------------------

const BEACON_PERIOD_MS = 1_600

/** 0..1。周期 1.6 秒、点灯はごく短い(鋭い立ち上がり → 保持 → 立ち下がり) */
export function beacon(elapsedMs: number): number {
  const local = mod(elapsedMs, BEACON_PERIOD_MS)
  if (local < 110) return local / 110
  if (local < 430) return 1
  if (local < 540) return 1 - (local - 430) / 110
  return 0
}

// --- 橋を流れる光の脈動 ------------------------------------------------

const SHIMMER_PERIOD_MS = 5_000

/** 橋の桁上を主塔から主塔へ流れる明るさの山の位置 0..1(周期でラップ) */
export function bridgeShimmer(elapsedMs: number): number {
  return mod(elapsedMs, SHIMMER_PERIOD_MS) / SHIMMER_PERIOD_MS
}

// --- 空の呼吸(薄明のゆらぎ) ----------------------------------------

/** 0.4..1。1 周期で 1 呼吸。薄明の残照の強さに掛ける */
export function skyBreath(elapsedMs: number): number {
  const s = 0.5 - 0.5 * Math.cos((2 * Math.PI * elapsedMs) / CYCLE_MS)
  return 0.4 + 0.6 * s
}

/** 0..1。大気のもや(haze)の横スクロール量。1 周期でラップ */
export function hazeDrift(elapsedMs: number): number {
  return mod(elapsedMs, CYCLE_MS) / CYCLE_MS
}

// --- 街明かりの瞬き --------------------------------------------------

/**
 * 1 個の光点の明滅係数 0..1。位相はシードで決まり、複数の非整数比の
 * 正弦を重ねてループ感を消す。稀に 1 個だけ強く光る「フレア」も混ぜる。
 */
export function twinkle(seed: number, elapsedMs: number): number {
  const t = elapsedMs / 1000
  const p = seed * 12.9898
  let v = 0.62 + 0.18 * Math.sin(t * 0.7 + p) + 0.12 * Math.sin(t * 1.63 + p * 1.7)
  // 稀なフレア: シード依存の遅い波が閾値を超えた瞬間だけ持ち上げる
  const slow = Math.sin(t * 0.21 + p * 3.1)
  if (slow > 0.985) v += (slow - 0.985) / 0.015
  return clamp01(v)
}

// --- 手前の道路を流れる車のテールランプ ----------------------------

const CAR_PERIOD_MS = 8_000
const CAR_TRAVEL_MS = 1_600

export interface CarTrailState {
  active: boolean
  /** FOREGROUND_ROAD_PATH に沿った位置 0..1 */
  t: number
  opacity: number
}

export function carTrail(elapsedMs: number): CarTrailState {
  const local = mod(elapsedMs, CAR_PERIOD_MS)
  if (local > CAR_TRAVEL_MS) return { active: false, t: 0, opacity: 0 }
  const t = local / CAR_TRAVEL_MS
  return { active: true, t, opacity: hump(t) }
}

// --- まとめ ---------------------------------------------------------

export interface TimelineSample {
  boats: [BoatState, BoatState, BoatState]
  beacon: number
  bridgeShimmer: number
  skyBreath: number
  hazeDrift: number
  carTrail: CarTrailState
}

/** 1 フレーム分の全アニメーション状態をまとめて返す */
export function sampleTimeline(elapsedMs: number): TimelineSample {
  return {
    boats: boats(elapsedMs),
    beacon: beacon(elapsedMs),
    bridgeShimmer: bridgeShimmer(elapsedMs),
    skyBreath: skyBreath(elapsedMs),
    hazeDrift: hazeDrift(elapsedMs),
    carTrail: carTrail(elapsedMs),
  }
}
