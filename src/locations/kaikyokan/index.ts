import * as THREE from 'three'
import type { LocationConfig } from '../types'

export const kaikyokanLocation: LocationConfig = {
  id: 'kaikyokan',
  name: '海響館',
  guidanceText: '手のひらを上にしてみてね（手のひらにペンギンが乗ります）',
  // 撮影後に手のひらを検出する専用フロー（KaikyokanCameraView）へ App.tsx が直接分岐するため
  // マーカーは使わないが、LocationConfig の判別に cameraMode は必須。
  cameraMode: 'image-target',
  targetSrc: '', // 撮影後手のひら検出のためマーカー不要
  effect: {
    loadModel: () => Promise.resolve({ object: new THREE.Group() }),
    getTransform: () => ({ position: [0, 0, 0], rotationX: 0, rotationY: 0, visible: true }),
  },
}
