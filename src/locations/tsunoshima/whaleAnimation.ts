import type { ArTransform } from '../types'

// マーカー座標系(tunoshima.jpgの中心を原点、幅=1、高さ=853/1280)における
// [開始: 橋左側の海中(海面より十分下), 頂点: 橋上空, 終了: 橋右側の海中(海面より十分下)]
//
// 開始・終了のYは、loadWhaleModel.tsのSEA_LEVEL_Y(海面クリッピングの高さ)より
// 確実に下にすること。そうしないと、まだ海面クリッピングで隠れきっていない
// (=体がまだ見えている)うちに、このモジュールの可視/非可視の切り替え
// (FLIGHT_DURATION_MS到達時)が先に発生し、クジラが不自然に瞬時に消えてしまう。
// 実機では、エンドポイントが浅すぎて弧の端点付近でクジラが縦向きに大きく
// 海面から突き出したまま可視トグルが発火し、ポップイン/ポップアウトして
// 見えた。そこで開始・終了Yを-0.15から-0.5へ深くしてマージンを大きくした
// (二次ベジェは曲線が制御点まで約半分しか届かないため、端点だけ深くすると
// 弧全体が水没する。制御点Yも0.2645から0.78へ引き上げ、オンカーブの頂点は
// y(0.5)=0.14 と従来の0.057よりわずかに高いアーチになる)。
const WAYPOINTS: [number, number, number][] = [
  [-0.2656, -0.5, 0],
  [0.0469, 0.78, 0.08],
  [0.3203, -0.5, 0],
]

// 「チープに見える」フィードバックを受け、駆け足だった動きをゆったりさせて
// 雄大さを出すため4000から5500に延長した(泳ぎアニメーションの再生速度も
// animationSpeedを介して同じ比率で緩やかになる)。
const FLIGHT_DURATION_MS = 5500
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
  //
  // whale.glbは無回転(rotationX=rotationY=0)のときローカル+Z軸が頭の向き
  // (Three.jsの簡易検証シーンで実測済み)。effectGroupはYXZのEuler合成
  // 順序(Y→X→Zの順で適用)を使う(ArCameraViewで設定)ため、ヨーが
  // 大きくても頭のワールドY成分はちょうど -sin(rotationX) になる。つまり
  // 鼻先を上げたい(dy>0)ときはrotationXを負にする必要がある(直感とは逆符号)。
  const rotationY = Math.atan2(dx, dz)
  const horizontalSpeed = Math.hypot(dx, dz)
  // 見栄えを良くするため、実際の軌道の傾きより少し大げさに角度をつける
  const PITCH_EXAGGERATION = 1.4
  const rotationX = -Math.atan2(dy, horizontalSpeed) * PITCH_EXAGGERATION

  return {
    position: [x, y, z],
    rotationX,
    rotationY,
    visible: true,
    animationSpeed: swimIntensity(t),
  }
}
