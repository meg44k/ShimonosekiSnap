import * as THREE from 'three'
import type { LocationConfig } from '../types'

export const ganryujimaLocation: LocationConfig = {
  id: 'ganryujima',
  name: '巌流島',
  guidanceText: 'カメラに向かって侍ポーズで写真を撮影してください（写真に刀が装着されます）',
  targetSrc: '', // 撮影後写真解析のためマーカー不要
  effect: {
    loadModel: () => Promise.resolve(new THREE.Group()),
    getTransform: () => ({ position: [0, 0, 0], rotationY: 0, visible: true }),
  },
}
