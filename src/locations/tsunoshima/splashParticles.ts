import * as THREE from 'three'

const POOL_SIZE = 30
const PARTICLES_PER_BURST = 12
const PARTICLE_LIFETIME_S = 0.6
const GRAVITY_Y = -1.2
const PARTICLE_SCALE = 0.015
const MIN_SPEED = 0.15
const MAX_SPEED_RANGE = 0.15
const MIN_RISE_SPEED = 0.25
const MAX_RISE_RANGE = 0.2
const MAX_OPACITY = 0.9

interface Particle {
  sprite: THREE.Sprite
  velocity: THREE.Vector3
  age: number
  active: boolean
}

// 外部画像を使わず、Canvas 2Dで柔らかい白い円のテクスチャを1枚だけ生成し、
// プール内の全スプライトで使い回す。
function createSplashTexture(): THREE.Texture {
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

export interface SplashEmitter {
  object: THREE.Object3D
  spawn: (position: [number, number, number]) => void
  update: (deltaSeconds: number) => void
}

// 固定数のスプライトを使い回すプール方式。spawn()のたびにフリーな
// スプライトを再利用してバーストを発生させるため、フレームごとの
// GC発生(オブジェクトの生成/破棄)を避けられる。
export function createSplashEmitter(): SplashEmitter {
  const group = new THREE.Group()
  const texture = createSplashTexture()
  const particles: Particle[] = []

  for (let i = 0; i < POOL_SIZE; i++) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    const sprite = new THREE.Sprite(material)
    sprite.scale.setScalar(PARTICLE_SCALE)
    sprite.visible = false
    group.add(sprite)
    particles.push({ sprite, velocity: new THREE.Vector3(), age: 0, active: false })
  }

  let cursor = 0

  function spawn(position: [number, number, number]) {
    for (let i = 0; i < PARTICLES_PER_BURST; i++) {
      const particle = particles[cursor]
      cursor = (cursor + 1) % POOL_SIZE

      const angle = Math.random() * Math.PI * 2
      const speed = MIN_SPEED + Math.random() * MAX_SPEED_RANGE
      particle.velocity.set(
        Math.cos(angle) * speed,
        MIN_RISE_SPEED + Math.random() * MAX_RISE_RANGE,
        Math.sin(angle) * speed,
      )
      particle.sprite.position.set(...position)
      particle.sprite.material.opacity = MAX_OPACITY
      particle.sprite.visible = true
      particle.age = 0
      particle.active = true
    }
  }

  function update(deltaSeconds: number) {
    for (const particle of particles) {
      if (!particle.active) continue

      particle.age += deltaSeconds
      if (particle.age >= PARTICLE_LIFETIME_S) {
        particle.active = false
        particle.sprite.visible = false
        continue
      }

      particle.velocity.y += GRAVITY_Y * deltaSeconds
      particle.sprite.position.addScaledVector(particle.velocity, deltaSeconds)
      const lifeRatio = particle.age / PARTICLE_LIFETIME_S
      particle.sprite.material.opacity = MAX_OPACITY * (1 - lifeRatio)
    }
  }

  return { object: group, spawn, update }
}
