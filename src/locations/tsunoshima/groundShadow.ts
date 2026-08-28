import * as THREE from 'three'

// クジラが浮かんでいるあたりの高さ(マーカー座標系)。実機での見た目を
// 見ながら調整する。0は「tunoshima.jpgの写真そのものの面」に相当する想定。
const GROUND_Y = 0

// 実写映像(カメラ映像)の上に影だけを落とすための、見えない地面。
// ShadowMaterialは影が落ちていない部分は完全に透明になるため、地面自体は
// 描画されず、実写の橋・海の上にクジラの影だけが重なって見える。
const SHADOW_OPACITY = 0.2
const GROUND_SIZE = 1.6

export function createGroundShadow(): THREE.Object3D {
  const group = new THREE.Group()

  const light = new THREE.DirectionalLight(0xffffff, 0.6)
  light.position.set(0.35, 1.1, 0.25)
  light.target.position.set(0, 0, 0)
  light.castShadow = true
  light.shadow.mapSize.set(1024, 1024)
  light.shadow.bias = -0.0015
  light.shadow.radius = 4
  const cam = light.shadow.camera
  cam.left = -0.8
  cam.right = 0.8
  cam.top = 0.8
  cam.bottom = -0.8
  cam.near = 0.05
  cam.far = 3
  cam.updateProjectionMatrix()
  group.add(light, light.target)

  const groundMaterial = new THREE.ShadowMaterial({ opacity: SHADOW_OPACITY })
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), groundMaterial)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = GROUND_Y
  ground.receiveShadow = true
  group.add(ground)

  return group
}
