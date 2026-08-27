import type * as THREE from 'three'

export interface ArTransform {
  position: [number, number, number]
  /** X軸回転(ピッチ、鼻先の上下方向の傾き) */
  rotationX: number
  /** Y軸回転(ヨー、進行方向の左右の向き) */
  rotationY: number
  visible: boolean
  /**
   * モデルに埋め込まれたアニメーション(骨格アニメーション等)を
   * 再生する際の速度倍率。省略時は1(等速)。0にすると一時停止する。
   * 例: 水中でしか推進できない生物が、空中にいる間だけ動きを緩める、など。
   */
  animationSpeed?: number
}

/**
 * loadModel()が返したオブジェクトの所有権はArCameraViewに移る。
 * カメラ画面のアンマウント時にgeometry/materialがdisposeされるため、
 * loadModel()は呼び出しごとに新しいインスタンスを返すこと
 * (キャッシュしたインスタンスを使い回すと、2回目以降のマウントで
 * disposeされたgeometryを参照してしまう)。
 *
 * updateは省略可能。モデルに埋め込みアニメーションがある場合、
 * ArCameraViewが毎フレーム呼び出す(引数は前フレームからの経過秒数)。
 *
 * clippingPlanesも省略可能。アンカー(マーカー)のローカル座標系で
 * 定義された固定の平面を指定すると、ArCameraViewが毎フレーム
 * アンカーのワールド行列を掛けてワールド座標系に変換し、
 * objectの各メッシュのマテリアルに適用する(平面の正の側=描画される側)。
 * 例: 海面の高さに平面を置き、水面より下を描画しないことで
 * 「海から出てくる」ような見た目にする。
 */
export interface LoadedEffectModel {
  object: THREE.Object3D
  update?: (deltaSeconds: number) => void
  clippingPlanes?: THREE.Plane[]
}

export interface ArEffect {
  loadModel(): Promise<LoadedEffectModel>
  getTransform(elapsedMs: number): ArTransform
}

export interface LocationConfig {
  id: string
  name: string
  guidanceText: string
  targetSrc: string
  effect: ArEffect
}
