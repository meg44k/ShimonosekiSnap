// 火の山「動く夜景」(平面版)の読み込みエントリ。夜景写真をデコードして
// buildNightScene に渡し、markerUpdate で時間だけを流し込む。フレームワーク側
// (ArCameraView / types.ts)には一切変更を加えない。

import * as THREE from 'three'
import type { LoadedEffectModel } from '../types'
import { buildNightScene } from './nightSceneModel'
import baseUrl from './assets/hinoyama-base.jpg?url'

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
  const model = buildNightScene(image)

  // object は effectGroup の子。getTransform は常に原点・visible:true を返すので
  // effectGroup(ひいてはこの夜景平面)はマーカー原点に貼り付く。
  const object = new THREE.Group()
  object.add(model.object)

  return {
    object,
    // targetVisible の間、毎フレーム (deltaSeconds, now - startedAt) で呼ばれる。
    // elapsedMs は onTargetFound でリセットされるので、認識のたびにループが頭出しされる。
    markerUpdate: (_deltaSeconds: number, elapsedMs: number) => {
      model.update(elapsedMs)
    },
  }
}
