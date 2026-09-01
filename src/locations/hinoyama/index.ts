import type { ArTransform, LocationConfig } from '../types'

// このスポットには動く主役がいない(夜景全体が動く)。getTransform は常に
// 定数を返し、エフェクト群はマーカー原点に貼り付く。アニメーションは
// loadNightScene が返す markerUpdate 側で elapsedMs から駆動する。
const STATIC_TRANSFORM: ArTransform = {
  position: [0, 0, 0],
  rotationX: 0,
  rotationY: 0,
  visible: true,
}

export const hinoyamaLocation: LocationConfig = {
  id: 'hinoyama',
  name: '火の山公園',
  guidanceText: '火の山からの夜景パネルを映してください',
  cameraMode: 'image-target',
  targetSrc: 'targets/hinoyama.mind',
  effect: {
    loadModel: () => import('./loadNightScene').then((m) => m.loadNightScene()),
    getTransform: () => STATIC_TRANSFORM,
  },
}
