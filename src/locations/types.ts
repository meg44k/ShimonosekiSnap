import type * as THREE from 'three'

export interface ArTransform {
  position: [number, number, number]
  rotationY: number
  visible: boolean
}

/**
 * loadModel()が返したオブジェクトの所有権はArCameraViewに移る。
 * カメラ画面のアンマウント時にgeometry/materialがdisposeされるため、
 * loadModel()は呼び出しごとに新しいインスタンスを返すこと
 * (キャッシュしたインスタンスを使い回すと、2回目以降のマウントで
 * disposeされたgeometryを参照してしまう)。
 */
export interface ArEffect {
  loadModel(): Promise<THREE.Object3D>
  getTransform(elapsedMs: number): ArTransform
}

interface BaseLocationConfig {
  id: string
  name: string
  guidanceText: string
}

export interface ImageTargetLocationConfig extends BaseLocationConfig {
  cameraMode: 'image-target'
  targetSrc: string
  effect: ArEffect
}

export interface PersonDetectionLocationConfig extends BaseLocationConfig {
  cameraMode: 'person-detection'
  overlaySrc: string
  costumeSrc: string
  detectionThreshold: number
}

export type LocationConfig = ImageTargetLocationConfig | PersonDetectionLocationConfig
