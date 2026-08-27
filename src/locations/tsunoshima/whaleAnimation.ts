import type { ArTransform } from '../types'

// マーカー座標系(tunoshima.jpgの中心を原点、幅=1、高さ=853/1280)における
// [開始: 橋左側の海面付近, 頂点: 橋上空, 終了: 橋右側の海面付近]
const WAYPOINTS: [number, number, number][] = [
  [-0.2656, -0.0965, 0],
  [0.0469, 0.2645, 0.08],
  [0.3203, -0.0418, 0],
]

const FLIGHT_DURATION_MS = 4000
const PAUSE_DURATION_MS = 1500
export const CYCLE_DURATION_MS = FLIGHT_DURATION_MS + PAUSE_DURATION_MS

const HIDDEN_TRANSFORM: ArTransform = {
  position: [0, 0, 0],
  rotationX: 0,
  rotationY: 0,
  visible: false,
}

function bezierPoint(t: number, p0: number, p1: number, p2: number): number {
  const u = 1 - t
  return u * u * p0 + 2 * u * t * p1 + t * t * p2
}

function bezierTangent(t: number, p0: number, p1: number, p2: number): number {
  return 2 * (1 - t) * (p1 - p0) + 2 * t * (p2 - p1)
}

// クジラは水中でしか尾びれで推進できないため、離水直後・着水直前は
// 遊泳アニメーションを全速で再生し、無重力状態に近い頂点付近では
// ほぼ静止させる(完全に止めると不自然なので下限を設ける)。
const MIN_SWIM_INTENSITY = 0.15

function swimIntensity(t: number): number {
  return MIN_SWIM_INTENSITY + (1 - MIN_SWIM_INTENSITY) * (1 - Math.sin(Math.PI * t))
}

export function getWhaleTransform(elapsedMs: number): ArTransform {
  const cycleMs = elapsedMs % CYCLE_DURATION_MS
  if (cycleMs >= FLIGHT_DURATION_MS) {
    return HIDDEN_TRANSFORM
  }

  const t = cycleMs / FLIGHT_DURATION_MS
  const [p0, p1, p2] = WAYPOINTS

  const x = bezierPoint(t, p0[0], p1[0], p2[0])
  const y = bezierPoint(t, p0[1], p1[1], p2[1])
  const z = bezierPoint(t, p0[2], p1[2], p2[2])

  const dx = bezierTangent(t, p0[0], p1[0], p2[0])
  const dy = bezierTangent(t, p0[1], p1[1], p2[1])
  const dz = bezierTangent(t, p0[2], p1[2], p2[2])

  // 鼻先が常に進行方向を向くよう、接線ベクトルからヨー(左右)と
  // ピッチ(上下)の両方を求める。上昇中は鼻上げ、下降中は鼻下げになる。
  const rotationY = Math.atan2(dx, dz)
  const horizontalSpeed = Math.hypot(dx, dz)
  const rotationX = Math.atan2(dy, horizontalSpeed)

  return {
    position: [x, y, z],
    rotationX,
    rotationY,
    visible: true,
    animationSpeed: swimIntensity(t),
  }
}
