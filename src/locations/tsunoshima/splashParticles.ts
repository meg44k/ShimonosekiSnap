import * as THREE from 'three'
import { SEA_LEVEL_Y } from './seaLevel'

// 1回の水しぶきは「垂直に噴き上がる柱(jet)」「弾道を描いて飛び散る水滴(droplet)」
// 「減速して漂う霧(mist)」の3種を同時に出す。それぞれ初速・重力・空気抵抗・
// 寿命・大きさが違うので、噴き上がって落ちてくる/細かい飛沫がふわっと残る、
// という水しぶきらしい挙動になる。マーカー座標系の値。実機で調整。
const POOL_SIZE = 130

interface Layer {
  count: number // 1バーストで出す数
  speedMin: number
  speedMax: number
  coneRad: number // 上方向からの広がり角(0=真上, 大きいほど横に散る)
  gravity: number // Y加速度(負)
  drag: number // 空気抵抗(1/秒)。大きいほど早く失速して「その場に漂う」
  lifeMin: number
  lifeMax: number
  scaleMin: number
  scaleMax: number
  grow: number // 寿命末までの拡大率(1=変化なし)。霧は膨らむ
  opacity: number
}

const JET: Layer = {
  count: 14,
  speedMin: 0.5,
  speedMax: 0.95,
  coneRad: 0.18,
  gravity: -3.6,
  drag: 0.4,
  lifeMin: 0.55,
  lifeMax: 1.0,
  scaleMin: 0.008,
  scaleMax: 0.016,
  grow: 1,
  opacity: 0.95,
}

const DROPLET: Layer = {
  count: 48,
  speedMin: 0.3,
  speedMax: 0.78,
  coneRad: 0.7,
  gravity: -3.0,
  drag: 0.7,
  lifeMin: 0.9,
  lifeMax: 1.7,
  scaleMin: 0.009,
  scaleMax: 0.03,
  grow: 1,
  opacity: 0.95,
}

const MIST: Layer = {
  count: 62,
  speedMin: 0.08,
  speedMax: 0.32,
  coneRad: 1.05,
  gravity: -0.9,
  drag: 4.2,
  lifeMin: 1.1,
  lifeMax: 2.3,
  scaleMin: 0.005,
  scaleMax: 0.014,
  grow: 1.6,
  opacity: 0.5,
}

const LAYERS = [JET, DROPLET, MIST]
const SPAWN_JITTER = 0.012 // 発生点の水平ばらつき(点ではなく小さな面から出す)

interface Particle {
  sprite: THREE.Sprite
  velocity: THREE.Vector3
  age: number
  life: number
  baseScale: number
  grow: number
  opacity: number
  active: boolean
}

// 外部画像を使わず、Canvas 2Dで芯の明るい柔らかい白い円を1枚だけ生成して使い回す。
function createSplashTexture(): THREE.Texture {
  const size = 48
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.85)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  return new THREE.CanvasTexture(canvas)
}

export interface SplashEmitter {
  object: THREE.Object3D
  spawn: (position: [number, number, number]) => void
  update: (deltaSeconds: number) => void
}

// 上方向を軸にした円錐内のランダムな単位ベクトル。coneRad が半頂角。
function coneDirection(coneRad: number, out: THREE.Vector3): THREE.Vector3 {
  const azimuth = Math.random() * Math.PI * 2
  // sqrt で外側にも均等に散らす
  const polar = Math.sqrt(Math.random()) * coneRad
  const sinP = Math.sin(polar)
  return out.set(Math.cos(azimuth) * sinP, Math.cos(polar), Math.sin(azimuth) * sinP)
}

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
    sprite.visible = false
    group.add(sprite)
    particles.push({
      sprite,
      velocity: new THREE.Vector3(),
      age: 0,
      life: 1,
      baseScale: 0.01,
      grow: 1,
      opacity: 1,
      active: false,
    })
  }

  let cursor = 0
  const dir = new THREE.Vector3()

  function spawn(position: [number, number, number]) {
    const [px, , pz] = position
    for (const layer of LAYERS) {
      for (let i = 0; i < layer.count; i++) {
        const particle = particles[cursor]
        cursor = (cursor + 1) % POOL_SIZE

        coneDirection(layer.coneRad, dir)
        const speed = layer.speedMin + Math.random() * (layer.speedMax - layer.speedMin)
        particle.velocity.copy(dir).multiplyScalar(speed)

        particle.sprite.position.set(
          px + (Math.random() - 0.5) * SPAWN_JITTER,
          SEA_LEVEL_Y,
          pz + (Math.random() - 0.5) * SPAWN_JITTER,
        )
        particle.life = layer.lifeMin + Math.random() * (layer.lifeMax - layer.lifeMin)
        particle.baseScale = layer.scaleMin + Math.random() * (layer.scaleMax - layer.scaleMin)
        particle.grow = layer.grow
        particle.opacity = layer.opacity
        particle.age = 0
        particle.active = true

        particle.sprite.scale.setScalar(particle.baseScale)
        particle.sprite.material.opacity = 0
        particle.sprite.visible = true
        // 空気抵抗はレイヤーごとに違うので velocity に畳み込めない。
        // update 側で使えるよう userData に持たせる。
        particle.sprite.userData.gravity = layer.gravity
        particle.sprite.userData.drag = layer.drag
      }
    }
  }

  function update(deltaSeconds: number) {
    for (const particle of particles) {
      if (!particle.active) continue

      particle.age += deltaSeconds
      const lifeRatio = particle.age / particle.life
      if (lifeRatio >= 1) {
        particle.active = false
        particle.sprite.visible = false
        continue
      }

      const gravity = particle.sprite.userData.gravity as number
      const drag = particle.sprite.userData.drag as number
      particle.velocity.y += gravity * deltaSeconds
      const damp = Math.max(0, 1 - drag * deltaSeconds)
      particle.velocity.multiplyScalar(damp)
      particle.sprite.position.addScaledVector(particle.velocity, deltaSeconds)

      // 水面より下に落ちたら「水に戻った」ものとして消す
      if (particle.sprite.position.y < SEA_LEVEL_Y) {
        particle.active = false
        particle.sprite.visible = false
        continue
      }

      // 立ち上がり8%で出現、末尾45%でフェードアウト
      const fadeIn = Math.min(1, lifeRatio / 0.08)
      const fadeOut = lifeRatio > 0.55 ? 1 - (lifeRatio - 0.55) / 0.45 : 1
      particle.sprite.material.opacity = particle.opacity * fadeIn * fadeOut
      particle.sprite.scale.setScalar(particle.baseScale * (1 + (particle.grow - 1) * lifeRatio))
    }
  }

  return { object: group, spawn, update }
}
