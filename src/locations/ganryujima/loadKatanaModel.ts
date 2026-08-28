import * as THREE from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import katanaObjUrl from './katanas.obj?url'

export type KatanaType = 'standard' | 'nodachi' | 'wakizashi' | 'long' | 'shirasaya'

// 各刀を構成するOBJオブジェクト名のマッピング
const KATANA_PARTS: Record<KatanaType, string[]> = {
  // 1. 宮本武蔵の打刀（基本）
  standard: ['handgrip1', 'tsuba', 'blade_base', 'blade', 'handgrip2'],
  // 2. 佐々木小次郎の物干し竿（大太刀）
  nodachi: [
    'handgrip2.004_handgrip2.006',
    'blade.004_blade.006',
    'blade_base.004_blade_base.006',
    'tsuba.004_tsuba.006',
    'handgrip1.004_handgrip1.006',
  ],
  // 3. 脇差（小太刀・二刀流用）
  wakizashi: ['handgrip2.001', 'blade.001', 'blade_base.001', 'tsuba.001', 'handgrip1.001'],
  // 4. 長刀
  long: [
    'handgrip1.003_handgrip1.005',
    'tsuba.003_tsuba.005',
    'blade_base.003_blade_base.005',
    'blade.003_blade.005',
    'handgrip2.003_handgrip2.005',
  ],
  // 5. 白鞘・別鍔
  shirasaya: [
    'handgrip2.002_handgrip2.004',
    'blade.002_blade.004',
    'blade_base.002_blade_base.004',
    'tsuba.002_tsuba.004',
    'handgrip1.002_handgrip1.004',
  ],
}

// OBJ全体のキャッシュ
let cachedRawObj: THREE.Group | null = null
let loadPromise: Promise<THREE.Group> | null = null

function fetchRawObj(): Promise<THREE.Group> {
  if (cachedRawObj) return Promise.resolve(cachedRawObj)
  if (loadPromise) return loadPromise

  const loader = new OBJLoader()
  loadPromise = new Promise((resolve, reject) => {
    loader.load(
      katanaObjUrl,
      (obj) => {
        cachedRawObj = obj
        resolve(obj)
      },
      undefined,
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
    )
  })

  return loadPromise
}

/**
 * 指定した種類の刀を抽出し、柄（グリップ握り手）を原点(0,0,0)・刃先を上向き(+Y)に整えたThree.jsグループを返す
 */
export async function loadKatanaModel(type: KatanaType = 'standard'): Promise<THREE.Group> {
  const rawObj = await fetchRawObj()
  const partNames = KATANA_PARTS[type] || KATANA_PARTS.standard

  const katanaGroup = new THREE.Group()

  // 高品質マテリアル
  const bladeMaterial = new THREE.MeshStandardMaterial({
    color: 0xf0f0f0,
    metalness: 0.95,
    roughness: 0.12,
    envMapIntensity: 1.6,
  })

  const tsubaMaterial = new THREE.MeshStandardMaterial({
    color: 0xd4af37, // 金色
    metalness: 0.9,
    roughness: 0.25,
  })

  const gripMaterial = new THREE.MeshStandardMaterial({
    color: 0x181818, // 深みのある黒（柄巻）
    metalness: 0.1,
    roughness: 0.85,
  })

  // 指定された刀のパーツのみを抽出
  const extractedMeshes: THREE.Mesh[] = []
  rawObj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (partNames.includes(child.name)) {
        const clonedMesh = child.clone(true)
        const name = child.name.toLowerCase()

        if (name.includes('blade') || name.includes('blade_base')) {
          clonedMesh.material = bladeMaterial
        } else if (name.includes('tsuba')) {
          clonedMesh.material = tsubaMaterial
        } else if (name.includes('handgrip')) {
          clonedMesh.material = gripMaterial
        } else {
          clonedMesh.material = bladeMaterial
        }

        extractedMeshes.push(clonedMesh)
      }
    }
  })

  if (extractedMeshes.length === 0) {
    throw new Error(`刀パーツの抽出に失敗しました (type: ${type})`)
  }

  const innerGroup = new THREE.Group()
  for (const mesh of extractedMeshes) {
    innerGroup.add(mesh)
  }

  // 鍔（ツバ）の位置と柄（グリップ）の範囲を計算
  let tsubaX = 0
  let tsubaFound = false
  const gripBox = new THREE.Box3()

  for (const mesh of extractedMeshes) {
    const name = mesh.name.toLowerCase()
    if (name.includes('tsuba')) {
      const box = new THREE.Box3().setFromObject(mesh)
      tsubaX = (box.min.x + box.max.x) / 2
      tsubaFound = true
    }
    if (name.includes('handgrip')) {
      gripBox.expandByObject(mesh)
    }
  }

  const gripCenter = new THREE.Vector3()
  if (!gripBox.isEmpty()) {
    gripBox.getCenter(gripCenter)
  } else {
    new THREE.Box3().setFromObject(innerGroup).getCenter(gripCenter)
  }

  // 握り手の中心: 鍔（ツバ）のすぐ後ろ（約0.4m手元側）を原点に設定
  const handHoldX = tsubaFound ? tsubaX - 0.45 : gripCenter.x
  innerGroup.position.set(-handHoldX, -gripCenter.y, -gripCenter.z)

  // 元のOBJはX軸方向（+Xが刃先、-Xが柄尻）なので、Z軸回りに+90度回転させて刃先を真上(+Y)にする
  const orientedContainer = new THREE.Group()
  orientedContainer.add(innerGroup)
  orientedContainer.rotation.z = Math.PI / 2

  // 基準スケール（実寸サイズ感: 全長約0.95m〜1.4m）
  const totalBox = new THREE.Box3().setFromObject(orientedContainer)
  const totalSize = new THREE.Vector3()
  totalBox.getSize(totalSize)

  const baseHeight = type === 'nodachi' ? 1.4 : type === 'wakizashi' ? 0.75 : 1.05
  const scale = baseHeight / Math.max(totalSize.x, totalSize.y, totalSize.z)
  orientedContainer.scale.setScalar(scale)

  katanaGroup.add(orientedContainer)
  katanaGroup.name = `katana_${type}`

  return katanaGroup
}
