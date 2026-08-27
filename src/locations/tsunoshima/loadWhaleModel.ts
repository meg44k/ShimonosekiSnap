import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { LoadedEffectModel } from '../types'
// whale.glb: "Whale" by Quaternius (poly.pizza), CC0
import whaleModelUrl from './whale.glb?url'

// 初期見積もり値。実機での見た目を見ながら調整する
const WHALE_SCALE = 0.05
const WHALE_BASE_ROTATION_X = 0
const WHALE_BASE_ROTATION_Y = 0

// whale.glbに埋め込まれた遊泳(尾びれの上下動)アニメーションのクリップ名
const SWIM_CLIP_NAME = 'Armature|Swim'

// 海面のY座標(マーカー座標系)。WAYPOINTSの開始/終了地点のY(-0.0965〜-0.0418、
// whaleAnimation.ts参照)の間に置いた概算値。この高さより下のモデルの部分を
// 描画しないことで、海から出てくる/海に戻っていくように見せる。
// 実機での見た目を見ながら調整する。
const SEA_LEVEL_Y = -0.07

const loader = new GLTFLoader()

export function loadWhaleModel(): Promise<LoadedEffectModel> {
  return new Promise((resolve, reject) => {
    loader.load(
      whaleModelUrl,
      (gltf) => {
        gltf.scene.scale.setScalar(WHALE_SCALE)
        gltf.scene.rotation.set(WHALE_BASE_ROTATION_X, WHALE_BASE_ROTATION_Y, 0)
        const group = new THREE.Group()
        group.add(gltf.scene)

        const mixer = new THREE.AnimationMixer(gltf.scene)
        const swimClip =
          gltf.animations.find((clip) => clip.name === SWIM_CLIP_NAME) ?? gltf.animations[0]
        if (swimClip) {
          mixer.clipAction(swimClip).play()
        }

        resolve({
          object: group,
          update: (deltaSeconds) => mixer.update(deltaSeconds),
          // 平面の法線が+Y、定数が-SEA_LEVEL_Yの場合、y > SEA_LEVEL_Yの部分が
          // 描画され、それより下(水中)は描画されない(検証済み)。
          clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, 1, 0), -SEA_LEVEL_Y)],
        })
      },
      undefined,
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
    )
  })
}
