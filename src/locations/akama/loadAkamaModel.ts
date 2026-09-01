import * as THREE from 'three'
import type { LoadedEffectModel } from '../types'
import hoichiUrl from './miminashi_hoichi.png?url'
import antokuUrl from './antoku_tenno.png?url'

const loader = new THREE.TextureLoader()

function loadTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace
        resolve(texture)
      },
      undefined,
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
    )
  })
}

export function loadAkamaModel(): Promise<LoadedEffectModel> {
  return Promise.all([loadTexture(hoichiUrl), loadTexture(antokuUrl)]).then(
    ([hoichiTexture, antokuTexture]) => {
      const group = new THREE.Group()

      // アスペクト比に基づく平面のサイズ定義
      // miminashi_hoichi.png: 374x362 (1.033)
      // antoku_tenno.png: 649x668 (0.971)
      const height = 0.36
      const hoichiWidth = height * (374 / 362)
      const antokuWidth = height * (649 / 668)

      // 左側: 耳なし芳一
      const hoichiGeo = new THREE.PlaneGeometry(hoichiWidth, height)
      const hoichiMat = new THREE.MeshBasicMaterial({
        map: hoichiTexture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const hoichiMesh = new THREE.Mesh(hoichiGeo, hoichiMat)
      hoichiMesh.position.set(-0.35, -0.15, 0.02)
      group.add(hoichiMesh)

      // 右側: 安徳天皇
      const antokuGeo = new THREE.PlaneGeometry(antokuWidth, height)
      const antokuMat = new THREE.MeshBasicMaterial({
        map: antokuTexture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const antokuMesh = new THREE.Mesh(antokuGeo, antokuMat)
      antokuMesh.position.set(0.35, -0.15, 0.02)
      group.add(antokuMesh)

      return { object: group }
    },
  )
}
