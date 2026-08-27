import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
// whale.glb: "Whale" by Quaternius (poly.pizza), CC0
import whaleModelUrl from './whale.glb?url'

// 初期見積もり値。実機での見た目を見ながら調整する
const WHALE_SCALE = 0.05
const WHALE_BASE_ROTATION_Y = 0

const loader = new GLTFLoader()

export function loadWhaleModel(): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(
      whaleModelUrl,
      (gltf) => {
        gltf.scene.scale.setScalar(WHALE_SCALE)
        gltf.scene.rotation.y = WHALE_BASE_ROTATION_Y
        const group = new THREE.Group()
        group.add(gltf.scene)
        resolve(group)
      },
      undefined,
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
    )
  })
}
