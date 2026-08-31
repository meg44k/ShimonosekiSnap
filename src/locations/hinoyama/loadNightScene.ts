// 火の山「動く夜景」エフェクトの読み込みエントリ。夜景写真をデコードして
// buildDiorama に渡し、markerUpdate で視点ずれを与える。フレームワーク側
// (ArCameraView / types.ts)には一切変更を加えない。

import * as THREE from 'three'
import type { LoadedEffectModel } from '../types'
import { buildDiorama } from './buildDiorama'
import { viewVector } from './parallax'
import baseUrl from './assets/hinoyama-base.jpg?url'

// buildDiorama.VIEW_FALLOFF と揃える(手持ちの小さな動きで視差が飽和する速さ)
const VIEW_FALLOFF = 3.2

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`failed to load night-scene base image: ${src}`))
    image.src = src
  })
}

export async function loadNightScene(): Promise<LoadedEffectModel> {
  const image = await loadImage(baseUrl)
  const diorama = buildDiorama(image)

  // object は effectGroup の子。getTransform は常に原点・visible:true を返すので
  // effectGroup はマーカー原点に貼り付き、diorama はその場で動く。
  const object = new THREE.Group()
  object.add(diorama.object)

  const cameraLocal = new THREE.Vector3()

  return {
    object,
    markerUpdate: (_deltaSeconds: number, elapsedMs: number) => {
      // MindAR ではカメラはワールド原点に固定され、マーカー姿勢がアンカーに乗る。
      // よって「object ローカル空間でのワールド原点」= 視点の左右/上下ずれ。
      object.updateWorldMatrix(true, false)
      cameraLocal.set(0, 0, 0)
      object.worldToLocal(cameraLocal)
      const [viewX, viewY] = viewVector(cameraLocal.x, cameraLocal.y, VIEW_FALLOFF)
      diorama.update(elapsedMs, viewX, viewY)
    },
  }
}
