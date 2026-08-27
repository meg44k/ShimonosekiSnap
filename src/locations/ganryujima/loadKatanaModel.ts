import * as THREE from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import katanaObjUrl from './katanas.obj?url'

const loader = new OBJLoader()

/**
 * 刀3Dモデルを読み込み、グリップ（柄の握り手位置）を原点(0,0,0)に揃えた3Dグループを生成する
 */
export function loadKatanaModel(): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(
      katanaObjUrl,
      (obj) => {
        const rootGroup = new THREE.Group()

        // 金属質・光沢感のある高品質マテリアルの設定
        const bladeMaterial = new THREE.MeshStandardMaterial({
          color: 0xcccccc,
          metalness: 0.95,
          roughness: 0.15,
          envMapIntensity: 1.2,
        })

        const tsubaMaterial = new THREE.MeshStandardMaterial({
          color: 0xd4af37, // 金色 (Dark Gold)
          metalness: 0.85,
          roughness: 0.3,
        })

        const gripMaterial = new THREE.MeshStandardMaterial({
          color: 0x1f1f1f, // 黒色 (柄巻き)
          metalness: 0.1,
          roughness: 0.8,
        })

        // 各パーツにマテリアルを適用
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const name = child.name.toLowerCase()
            if (name.includes('blade') || name.includes('blade_base')) {
              child.material = bladeMaterial
            } else if (name.includes('tsuba')) {
              child.material = tsubaMaterial
            } else if (name.includes('handgrip')) {
              child.material = gripMaterial
            } else {
              child.material = bladeMaterial
            }
            child.castShadow = true
            child.receiveShadow = true
          }
        })

        // モデル全体のバウンディングボックスを計算
        const box = new THREE.Box3().setFromObject(obj)
        const size = new THREE.Vector3()
        box.getSize(size)

        // 刀の柄（グリップ）付近を原点(0,0,0)にするためのオフセット調整
        // katanas.obj は X軸方向に伸びているため、柄端を原点に揃える
        obj.position.set(-box.min.x - 0.2, -box.min.y - size.y * 0.5, -box.min.z - size.z * 0.5)

        // 基準スケール（持ちやすいサイズに正規化: 全長約 0.9〜1.0m 相当）
        const normalizedScale = 0.25 / Math.max(size.x, size.y, size.z)
        obj.scale.setScalar(normalizedScale)

        rootGroup.add(obj)
        resolve(rootGroup)
      },
      undefined,
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
    )
  })
}
