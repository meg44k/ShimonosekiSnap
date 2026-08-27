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
        })
      },
      undefined,
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
    )
  })
}
