import type * as THREE from 'three'

export interface ArTransform {
  position: [number, number, number]
  rotationY: number
  visible: boolean
}

export interface ArEffect {
  loadModel(): Promise<THREE.Object3D>
  getTransform(elapsedMs: number): ArTransform
}

export interface LocationConfig {
  id: string
  name: string
  guidanceText: string
  targetSrc: string
  effect: ArEffect
}
