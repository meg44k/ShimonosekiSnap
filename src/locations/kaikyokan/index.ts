import * as THREE from 'three'
import type { LocationConfig } from '../types'

export const kaikyokanLocation: LocationConfig = {
  id: 'kaikyokan',
  name: '海響館',
  guidanceText: '手のひらを上にしてみてね（手のひらにペンギンが乗ります）',
  targetSrc: '', // 撮影後手のひら検出のためマーカー不要
  effect: {
    loadModel: () => Promise.resolve(new THREE.Group()),
    getTransform: () => ({ position: [0, 0, 0], rotationY: 0, visible: true }),
  },
}
