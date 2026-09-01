import * as THREE from 'three'
import type { LocationConfig } from '../types'

export const ganryujimaLocation: LocationConfig = {
  id: 'ganryujima',
  name: '巌流島',
  guidanceText: 'カメラに向かって侍ポーズで写真を撮影してください（写真に刀が装着されます）',
  // 撮影後に写真を解析する専用フロー（GanryuCameraView）へ App.tsx が直接分岐するため
  // マーカーは使わないが、LocationConfig の判別に cameraMode は必須。
  cameraMode: 'image-target',
  targetSrc: '', // 撮影後写真解析のためマーカー不要
  effect: {
    loadModel: () => Promise.resolve({ object: new THREE.Group() }),
    getTransform: () => ({ position: [0, 0, 0], rotationX: 0, rotationY: 0, visible: true }),
  },
}
