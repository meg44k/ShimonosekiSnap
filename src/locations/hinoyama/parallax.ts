// 奥行きレイヤーの視差(パララックス)計算。3D 平面をマーカー前後に置くことで
// 実カメラの移動から自然な視差は既に生まれるが、スマホを手で持って動かせる幅は
// 小さいため、その動きを増幅して奥行きを強調するための純粋ヘルパー。

export interface ParallaxLayer {
  /** マーカー平面からの前後オフセット(sceneTrace.LayerDef.z と同じ) */
  z: number
  /** 視差の増幅係数。0 で増幅なし(実 3D 視差のみ) */
  boost: number
  /** レイヤーがずれてよい最大量(マーカー幅=1 に対する比率)。描画外の露出を防ぐ */
  maxShift: number
}

/**
 * 生のローカルカメラ位置(マーカー座標系での視点の左右/上下ずれ)を、
 * tanh で [-1,1] に丸めた「視点ベクトル」に変換する。大きく動いても
 * レイヤーが吹き飛ばないようにするための飽和。
 * @param falloff 大きいほど早く飽和する
 */
export function viewVector(localX: number, localY: number, falloff = 6): [number, number] {
  return [Math.tanh(localX * falloff), Math.tanh(localY * falloff)]
}

/** clamp(x, -limit, +limit) */
function clampAbs(x: number, limit: number): number {
  if (x > limit) return limit
  if (x < -limit) return -limit
  return x
}

/**
 * 視点ベクトル(viewVector の出力)から、あるレイヤーの追加ずれ量を返す。
 * ずれは視点と逆符号 = 視点が右へ動くと手前のレイヤーは左へ流れる。
 * far レイヤー(z<0)は符号が反転し、奥は視点と同じ側へわずかに動く。
 */
export function parallaxOffset(
  viewX: number,
  viewY: number,
  layer: ParallaxLayer,
): [number, number] {
  const gain = -layer.z * layer.boost
  // `|| 0` は -0 を 0 に正規化するため(-layer.z が負のとき 0 * gain が -0 になる)
  return [
    clampAbs(viewX * gain, layer.maxShift) || 0,
    clampAbs(viewY * gain, layer.maxShift) || 0,
  ]
}
