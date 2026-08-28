import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import type { LoadedEffectModel } from '../types'
import { SEA_LEVEL_Y } from './seaLevel'
import { createSparkleEmitter } from './sparkleParticles'
import { createSplashEmitter } from './splashParticles'
import { detectSplashCrossing } from './splashTrigger'
// humpback-whale.glb: processed from "Humpback Whale (Swimming)" by Connlan_Immure
// (https://sketchfab.com/3d-models/humpback-whale-swimming-f4912be9163a4f45b2480df8ccb8b2c6),
// CC-BY-4.0. Textures stripped; only geometry/skin/animation kept. See scripts/process-whale-model.mjs.
import whaleModelUrl from './humpback-whale.glb?url'

// このモデルは全長約27ユニット(POSITION の X 幅)。マーカー座標系での
// 全長がおおよそ tunoshima.jpg 横幅の 0.5〜0.7 倍になるよう初期見積もり。
// 実機の見た目(尻尾が橋に被らないか等)を見て Task 7 で調整する。
const WHALE_SCALE = 0.022
// このモデルはローカル -X が頭の向き。whaleAnimation.ts は +Z が頭前提の
// rotationY を返すので、-X を +Z に合わせる基準回転を入れる。符号(+/-90°)は
// 実機で頭が進行方向を向く方を Task 7 で確定する。
const WHALE_BASE_ROTATION_X = 0
const WHALE_BASE_ROTATION_Y = Math.PI / 2

// humpback-whale.glb に含まれる唯一の遊泳クリップ名
const SWIM_CLIP_NAME = 'Take 001'

const loader = new GLTFLoader()

export function loadWhaleModel(): Promise<LoadedEffectModel> {
  return new Promise((resolve, reject) => {
    loader.load(
      whaleModelUrl,
      (gltf) => {
        gltf.scene.scale.setScalar(WHALE_SCALE)
        gltf.scene.rotation.set(WHALE_BASE_ROTATION_X, WHALE_BASE_ROTATION_Y, 0)

        // エッジ検出は面の法線に Sobel をかけるので、シェーディングの
        // 継ぎ目で法線が割れているとそこに余計な線が出る。mergeVertices は
        // normal 属性もハッシュに含めるため、法線が食い違う頂点は位置が
        // 同じでも統合されない。そこで一旦 normal 属性を削除して位置だけで
        // welding させ、その後 computeVertexNormals() で法線を計算し直す。
        // マテリアルは実際には ArCameraView 側の MeshNormalMaterial
        // オーバーライドでしか描かれないが、有効なマテリアルは必要なので
        // フラットなものを残す。
        const flat = new THREE.MeshBasicMaterial({ color: 0x24495c })
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.deleteAttribute('normal')
            child.geometry = mergeVertices(child.geometry)
            child.geometry.computeVertexNormals()
            child.material = flat
          }
        })

        const group = new THREE.Group()
        group.add(gltf.scene)

        const mixer = new THREE.AnimationMixer(gltf.scene)
        const swimClip =
          gltf.animations.find((clip) => clip.name === SWIM_CLIP_NAME) ?? gltf.animations[0]
        if (swimClip) {
          mixer.clipAction(swimClip).play()
        }

        // クジラが見えている間、体の周りに光の粒が漂う。クジラと一緒に
        // 動いてよいのでクジラのローカルグループにそのまま追加する
        // (Sprite なので ArCameraView 側で線画化の対象外になる)。
        const sparkles = createSparkleEmitter()
        group.add(sparkles.object)

        // 水しぶきはクジラと一緒に動いてはいけない(発生した海面位置に
        // 留まる)ため、markerObject として別枠で公開しエフェクトグループの
        // 外(マーカー座標系直下)へ配置してもらう。
        const splash = createSplashEmitter()
        const markerGroup = new THREE.Group()
        markerGroup.add(splash.object)
        let prevElapsedMs = 0

        resolve({
          object: group,
          lineArt: true,
          update: (deltaSeconds) => {
            mixer.update(deltaSeconds)
            sparkles.update(deltaSeconds)
          },
          // 平面の法線が +Y、定数が -SEA_LEVEL_Y の場合、y > SEA_LEVEL_Y の
          // 部分が描画され、それより下(水中)は描画されない。
          clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, 1, 0), -SEA_LEVEL_Y)],
          markerObject: markerGroup,
          markerUpdate: (deltaSeconds, elapsedMs) => {
            const event = detectSplashCrossing(prevElapsedMs, elapsedMs)
            if (event) {
              splash.spawn(event.position)
            }
            prevElapsedMs = elapsedMs
            splash.update(deltaSeconds)
          },
        })
      },
      undefined,
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
    )
  })
}
