import * as THREE from 'three'

const POOL_SIZE = 40
const SPAWN_INTERVAL_S = 0.12
const PARTICLE_LIFETIME_S = 1.4
// クジラの全長(WHALE_SCALE適用後で概ね0.4)に対して、体の周りにふわっと
// まとわりつく程度の半径。この値はloadWhaleModel.tsのグループ(クジラの
// ローカル座標系)にそのまま追加するための、クジラ基準の相対値。
const SPAWN_RADIUS = 0.22
const DRIFT_SPEED = 0.03
const PARTICLE_SCALE = 0.01
const MAX_OPACITY = 0.85
const TWINKLE_SPEED = 9

interface Particle {
  sprite: THREE.Sprite
  velocity: THREE.Vector3
  age: number
  active: boolean
  twinkleOffset: number
}

// splashParticles.tsと同じ手法(Canvas 2Dで生成した柔らかい円のテクスチャ)。
// 外部画像は使わない。
function createSparkleTexture(): THREE.Texture {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
  }
  return new THREE.CanvasTexture(canvas)
}

export interface SparkleEmitter {
  object: THREE.Object3D
  update: (deltaSeconds: number) => void
}

// クジラが見えている間、常時ふわふわと明滅する光の粒をまとわせるための
// エミッター。splashParticles.tsと同じくスプライトのプールを使い回す方式。
export function createSparkleEmitter(color: THREE.ColorRepresentation = '#dff6ff'): SparkleEmitter {
  const group = new THREE.Group()
  const texture = createSparkleTexture()
  const particles: Particle[] = []

  for (let i = 0; i < POOL_SIZE; i++) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const sprite = new THREE.Sprite(material)
    sprite.scale.setScalar(PARTICLE_SCALE)
    sprite.visible = false
    group.add(sprite)
    particles.push({ sprite, velocity: new THREE.Vector3(), age: 0, active: false, twinkleOffset: 0 })
  }

  let cursor = 0
  let spawnTimer = 0

  function spawnOne() {
    const particle = particles[cursor]
    cursor = (cursor + 1) % POOL_SIZE

    const direction = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
    ).normalize()
    const radius = SPAWN_RADIUS * (0.3 + Math.random() * 0.7)

    particle.sprite.position.copy(direction).multiplyScalar(radius)
    particle.velocity.copy(direction).multiplyScalar(DRIFT_SPEED)
    particle.age = 0
    particle.active = true
    particle.twinkleOffset = Math.random() * 10
    particle.sprite.visible = true
  }

  function update(deltaSeconds: number) {
    spawnTimer += deltaSeconds
    while (spawnTimer >= SPAWN_INTERVAL_S) {
      spawnTimer -= SPAWN_INTERVAL_S
      spawnOne()
    }

    for (const particle of particles) {
      if (!particle.active) continue

      particle.age += deltaSeconds
      if (particle.age >= PARTICLE_LIFETIME_S) {
        particle.active = false
        particle.sprite.visible = false
        continue
      }

      particle.sprite.position.addScaledVector(particle.velocity, deltaSeconds)
      const lifeRatio = particle.age / PARTICLE_LIFETIME_S
      const fadeInOut = Math.sin(Math.PI * lifeRatio)
      const twinkle = 0.7 + 0.3 * Math.sin((particle.age + particle.twinkleOffset) * TWINKLE_SPEED)
      particle.sprite.material.opacity = MAX_OPACITY * fadeInOut * twinkle
    }
  }

  return { object: group, update }
}
