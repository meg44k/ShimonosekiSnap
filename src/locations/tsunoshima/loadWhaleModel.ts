import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import type { LoadedEffectModel } from '../types'
import { createWhaleGlowMaterial } from './glowMaterial'
import { createGroundShadow } from './groundShadow'
import { SEA_LEVEL_Y } from './seaLevel'
import { createSparkleEmitter } from './sparkleParticles'
import { createSplashEmitter } from './splashParticles'
import { detectSplashCrossing } from './splashTrigger'
// whale.glb: "Whale" by Quaternius (poly.pizza), CC0
import whaleModelUrl from './whale.glb?url'

// 初期見積もり値。実機での見た目を見ながら調整する。
// whale.glbの実測サイズ(頭から尾まで約20ユニット、Three.jsの簡易検証
// シーンで実測)にWHALE_SCALEを掛けた値が、マーカー座標系での全長になる。
// 0.05だと全長が約1.0(=tunoshima.jpgの横幅とほぼ同じ)になり、頭が橋を
// 通り過ぎても尾がまだ橋の上に残ってしまっていたため、0.02まで縮小した
// 経緯がある。ただし0.02は「チープ・雄大さがない」というフィードバックの
// 一因でもあったため、0.028まで戻した。再びしっぽが橋に被る場合は
// この値を下げるか、WAYPOINTS(whaleAnimation.ts)の頂点の高さを上げる。
const WHALE_SCALE = 0.028
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

        // 塗りつぶしをやめ、輪郭が光る線画イラスト風の見た目にする。
        // SkinnedMeshでもThree.js標準のスキニング処理がそのまま働くため、
        // マテリアルを差し替えるだけで遊泳アニメーションに追従する。
        const glowMaterial = createWhaleGlowMaterial()
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            // ローポリモデルは面ごとに頂点が分かれておりカクカクした陰影に
            // なりがちなので、隣接する頂点を統合してからスムーズな法線を
            // 計算し直す(「チープに見える」フィードバックを受けた調整)。
            child.geometry = mergeVertices(child.geometry)
            child.geometry.computeVertexNormals()
            child.material = glowMaterial
            child.castShadow = true
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

        // クジラが見えている間、体の周りに光の粒がふわふわ漂うようにする。
        // splashとは違いクジラと一緒に動いてよい(むしろ動いてほしい)ため、
        // markerObjectではなくクジラのローカルグループにそのまま追加する。
        const sparkles = createSparkleEmitter()
        group.add(sparkles.object)

        const splash = createSplashEmitter()
        // クジラのgetWhaleTransform()は「エフェクトグループ」の位置として毎フレーム
        // 上書きされるが、水しぶきはクジラと一緒に動いてはいけない(発生した海面の
        // 位置に留まる必要がある)ため、markerObject/markerUpdateとして別枠で公開し、
        // ArCameraViewにエフェクトグループの外(マーカー座標系直下)へ配置してもらう。
        // 影用の光源・地面も同じくマーカー座標系に固定したいので、この枠に相乗りさせる。
        const markerGroup = new THREE.Group()
        markerGroup.add(splash.object, createGroundShadow())
        let prevElapsedMs = 0

        resolve({
          object: group,
          update: (deltaSeconds) => {
            mixer.update(deltaSeconds)
            sparkles.update(deltaSeconds)
          },
          // 平面の法線が+Y、定数が-SEA_LEVEL_Yの場合、y > SEA_LEVEL_Yの部分が
          // 描画され、それより下(水中)は描画されない(検証済み)。
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
