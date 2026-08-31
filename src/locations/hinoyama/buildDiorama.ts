// デコード済みの夜景写真から、6 枚の奥行きレイヤー(実 3D 平面)と発光要素・
// 前面オーバーレイを組み立てる。実カメラが動くとレイヤー間で視差が生まれ、
// 写真の中を覗き込むように見える。色補正は読み込み時に一度だけ済ませ、
// 発光は生成テクスチャで表現する(実行時ポスト処理なし)。

import * as THREE from 'three'
import { gradeImageData, NIGHT_GRADE } from './imageGrade'
import { extractLightPoints, rgbaToLuma } from './lightField'
import { boats, beacon, bridgeShimmer, carTrail, skyBreath, twinkle } from './motionTimeline'
import { parallaxOffset } from './parallax'
import {
  BRIDGE_BEACON_UV,
  BRIDGE_PATH,
  CITY_LIGHT_REGIONS,
  FOREGROUND_ROAD_PATH,
  imageToMarker,
  LAYER_DEFS,
  MARKER_ASPECT,
  pointInPolygon,
  sampleSpline,
  STRAIT_PATH,
  type LayerDef,
} from './sceneTrace'
import {
  createAfterglowTexture,
  createGlowTexture,
  createGrainTexture,
  createSkyTexture,
  createVignetteTexture,
} from './textures'

/** レイヤーテクスチャの最大幅(px)。元画像が上回る場合は縮小 */
const LAYER_MAX_WIDTH = 1024
/** 視差の増幅係数(parallax.ts)。手持ちの小さな動きを奥行きに変換 */
const PARALLAX_BOOST = 5
/** レイヤーがずれてよい最大量(マーカー幅=1 に対する比率) */
const PARALLAX_MAX_SHIFT = 0.06

interface LayerHandle {
  group: THREE.Group
  z: number
}

interface GlowHandle {
  sprite: THREE.Sprite
  baseOpacity: number
  baseScale: number
  seed: number
}

interface BoatHandle {
  head: THREE.Sprite
  wake: THREE.Sprite
}

export interface DioramaHandle {
  object: THREE.Group
  /** @param view エフェクト原点から見たカメラの左右/上下ずれ(マーカー座標系) */
  update(elapsedMs: number, viewX: number, viewY: number): void
  dispose(): void
}

// --- テクスチャ組み立て --------------------------------------------------

interface Decoded {
  gradedCanvas: HTMLCanvasElement
  luma: Float32Array
  width: number
  height: number
}

/** 写真をワークキャンバスへ描き、ナイトグレードを焼き込み、輝度も取り出す */
function decodeAndGrade(image: CanvasImageSource & { width: number; height: number }): Decoded {
  const width = Math.min(LAYER_MAX_WIDTH, image.width)
  const height = Math.round((width / image.width) * image.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return { gradedCanvas: canvas, luma: new Float32Array(width * height), width, height }
  ctx.drawImage(image, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  gradeImageData(imageData.data, NIGHT_GRADE)
  ctx.putImageData(imageData, 0, 0)
  const luma = rgbaToLuma(imageData.data, width, height)
  return { gradedCanvas: canvas, luma, width, height }
}

/** レイヤーの多角形(画像UV)で切り抜いた、フェザー付きテクスチャを作る */
function buildLayerTexture(decoded: Decoded, layer: LayerDef): THREE.CanvasTexture {
  const { width, height } = decoded
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const ctx = out.getContext('2d')
  if (ctx) {
    ctx.drawImage(decoded.gradedCanvas, 0, 0)
    // マスク: 多角形を白で塗り、フェザーぶんぼかして destination-in で切り抜く
    const mask = document.createElement('canvas')
    mask.width = width
    mask.height = height
    const mctx = mask.getContext('2d')
    if (mctx) {
      mctx.fillStyle = '#fff'
      const blur = Math.max(0, layer.feather * width)
      mctx.filter = blur > 0 ? `blur(${blur}px)` : 'none'
      for (const polygon of layer.polygons) {
        mctx.beginPath()
        polygon.forEach(([u, v], i) => {
          const x = u * width
          const y = v * height
          if (i === 0) mctx.moveTo(x, y)
          else mctx.lineTo(x, y)
        })
        mctx.closePath()
        mctx.fill()
      }
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(mask, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
    }
  }
  const texture = new THREE.CanvasTexture(out)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

function layerPlane(texture: THREE.Texture | null, layer: LayerDef, oversize: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(
    1 * layer.scaleComp * oversize,
    MARKER_ASPECT * layer.scaleComp * oversize,
  )
  const material = new THREE.MeshBasicMaterial({
    map: texture ?? undefined,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.z = layer.z
  return mesh
}

// --- 発光スプライト ----------------------------------------------------

function sampleColor(canvas: HTMLCanvasElement, u: number, v: number): THREE.Color {
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.Color(0xffffff)
  const x = Math.min(canvas.width - 1, Math.max(0, Math.round(u * canvas.width)))
  const y = Math.min(canvas.height - 1, Math.max(0, Math.round(v * canvas.height)))
  const [r, g, b] = ctx.getImageData(x, y, 1, 1).data
  const color = new THREE.Color(r / 255, g / 255, b / 255)
  // 彩度を持ち上げて「光源の色」として読みやすくする
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl)
  color.setHSL(hsl.h, Math.min(1, hsl.s * 1.6 + 0.15), Math.min(1, hsl.l * 0.5 + 0.5))
  return color
}

function makeGlow(
  glowTex: THREE.Texture,
  color: THREE.Color,
  scale: number,
  opacity: number,
): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: glowTex,
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.setScalar(scale)
  return sprite
}

// --- 本体 -------------------------------------------------------------

export function buildDiorama(
  image: CanvasImageSource & { width: number; height: number },
): DioramaHandle {
  const root = new THREE.Group()
  const decoded = decodeAndGrade(image)
  const glowTex = createGlowTexture(128)
  const disposables: { dispose(): void }[] = [glowTex]

  // レイヤー平面 --------------------------------------------------------
  const layerHandles: Record<string, LayerHandle> = {}
  LAYER_DEFS.forEach((layer, index) => {
    const group = new THREE.Group()
    group.position.z = 0
    group.renderOrder = index * 10
    if (layer.id === 'sky') {
      const skyTex = createSkyTexture(640, Math.round(640 * MARKER_ASPECT * 1.2))
      disposables.push(skyTex)
      const mesh = layerPlane(skyTex, layer, 1.25)
      mesh.renderOrder = index * 10
      group.add(mesh)
    } else {
      const tex = buildLayerTexture(decoded, layer)
      disposables.push(tex)
      const mesh = layerPlane(tex, layer, 1.08)
      mesh.renderOrder = index * 10
      group.add(mesh)
    }
    root.add(group)
    layerHandles[layer.id] = { group, z: layer.z }
  })

  const zOf = (id: string) => layerHandles[id]?.z ?? 0

  // 街明かりのグロー --------------------------------------------------
  const glows: GlowHandle[] = []
  const cityGroup = layerHandles.city.group
  const points = extractLightPoints(decoded.luma, decoded.width, decoded.height, {
    threshold: 0.62,
    suppressionRadius: 4,
    maxPoints: 260,
  })
  for (const point of points) {
    // どの街の領域に入るかで暖色/寒色の寄せを変える
    let warmth = 0.5
    for (const region of CITY_LIGHT_REGIONS) {
      if (pointInPolygon([point.u, point.v], region.polygon)) warmth = region.warmth
    }
    const color = sampleColor(decoded.gradedCanvas, point.u, point.v)
    color.lerp(new THREE.Color(warmth > 0.5 ? 0xffb066 : 0xbfd8ff), 0.35)
    const [mx, my] = imageToMarker(point.u, point.v)
    const scale = 0.012 + point.intensity * 0.03
    const baseOpacity = 0.25 + point.intensity * 0.5
    const sprite = makeGlow(glowTex, color, scale, baseOpacity)
    sprite.position.set(mx, my, zOf('city') + 0.001)
    sprite.renderOrder = 25
    cityGroup.add(sprite)
    glows.push({
      sprite,
      baseOpacity,
      baseScale: scale,
      seed: Math.round(point.u * 1000 + point.v * 7919),
    })
  }

  // 関門橋の航空障害灯 ------------------------------------------------
  const bridgeGroup = layerHandles.bridge.group
  const [bx, by] = imageToMarker(BRIDGE_BEACON_UV[0], BRIDGE_BEACON_UV[1])
  const beaconSprite = makeGlow(glowTex, new THREE.Color(0xff3b30), 0.03, 0)
  beaconSprite.position.set(bx, by, zOf('bridge') + 0.002)
  beaconSprite.renderOrder = 46
  bridgeGroup.add(beaconSprite)

  // 橋を流れる光の脈動 ----------------------------------------------
  const shimmerSprite = makeGlow(glowTex, new THREE.Color(0xfff0d8), 0.05, 0)
  shimmerSprite.position.z = zOf('bridge') + 0.002
  shimmerSprite.renderOrder = 46
  bridgeGroup.add(shimmerSprite)

  // 船 + 航跡 ------------------------------------------------------
  const waterGroup = layerHandles.water.group
  const boatHandles: BoatHandle[] = []
  for (let i = 0; i < 3; i++) {
    const head = makeGlow(glowTex, new THREE.Color(0xffd9a8), 0.02, 0)
    const wake = makeGlow(glowTex, new THREE.Color(0xbfe6ff), 0.04, 0)
    head.renderOrder = 36
    wake.renderOrder = 35
    head.position.z = zOf('water') + 0.002
    wake.position.z = zOf('water') + 0.001
    waterGroup.add(wake)
    waterGroup.add(head)
    boatHandles.push({ head, wake })
  }

  // 手前の道路の車テールランプ ----------------------------------
  const nearGroup = layerHandles.near.group
  const carSprite = makeGlow(glowTex, new THREE.Color(0xff7040), 0.03, 0)
  carSprite.position.z = zOf('near') + 0.002
  carSprite.renderOrder = 56
  nearGroup.add(carSprite)

  // 前面オーバーレイ(視差の外・マーカー正面に固定) --------------
  const overlay = new THREE.Group()
  overlay.position.z = 0.05
  overlay.renderOrder = 100
  root.add(overlay)

  const afterglowTex = createAfterglowTexture()
  disposables.push(afterglowTex)
  const afterglow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, MARKER_ASPECT * 0.5),
    new THREE.MeshBasicMaterial({
      map: afterglowTex,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  )
  afterglow.position.set(0, MARKER_ASPECT * 0.12, 0)
  afterglow.renderOrder = 100
  overlay.add(afterglow)

  const grainTex = createGrainTexture(256)
  disposables.push(grainTex)
  const grain = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, MARKER_ASPECT * 1.2),
    new THREE.MeshBasicMaterial({
      map: grainTex,
      transparent: true,
      opacity: 0.05,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  )
  grain.renderOrder = 101
  grainTex.repeat.set(2.4, 2.4)
  overlay.add(grain)

  const vignetteTex = createVignetteTexture()
  disposables.push(vignetteTex)
  const vignette = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, MARKER_ASPECT * 1.2),
    new THREE.MeshBasicMaterial({
      map: vignetteTex,
      transparent: true,
      opacity: 0.55,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  vignette.renderOrder = 102
  overlay.add(vignette)

  // --- 毎フレーム更新 ---------------------------------------------

  function applyParallax(elapsedMs: number, viewX: number, viewY: number): void {
    for (const layer of LAYER_DEFS) {
      const handle = layerHandles[layer.id]
      const [ox, oy] = parallaxOffset(viewX, viewY, {
        z: layer.z,
        boost: PARALLAX_BOOST,
        maxShift: PARALLAX_MAX_SHIFT,
      })
      handle.group.position.x = ox
      handle.group.position.y = oy
    }
    // haze/afterglow のわずかな横流れ
    afterglow.position.x = Math.sin(elapsedMs / 9000) * 0.02
  }

  function updateGlows(elapsedMs: number): void {
    for (const glow of glows) {
      const t = twinkle(glow.seed, elapsedMs)
      glow.sprite.material.opacity = glow.baseOpacity * (0.55 + 0.65 * t)
      glow.sprite.scale.setScalar(glow.baseScale * (0.9 + 0.25 * t))
    }
  }

  function updateBridge(elapsedMs: number): void {
    beaconSprite.material.opacity = beacon(elapsedMs)
    const s = bridgeShimmer(elapsedMs)
    const [su, sv] = sampleSpline(BRIDGE_PATH, s)
    const [mx, my] = imageToMarker(su, sv)
    shimmerSprite.position.x = mx
    shimmerSprite.position.y = my
    // 端で消えて中央で最も明るい
    shimmerSprite.material.opacity = 0.7 * Math.sin(Math.PI * s)
  }

  function updateBoats(elapsedMs: number): void {
    const states = boats(elapsedMs)
    states.forEach((state, i) => {
      const handle = boatHandles[i]
      if (!state.active) {
        handle.head.material.opacity = 0
        handle.wake.material.opacity = 0
        return
      }
      const [u, v] = sampleSpline(STRAIT_PATH, state.t)
      const [mx, my] = imageToMarker(u, v)
      handle.head.position.x = mx
      handle.head.position.y = my
      handle.head.material.opacity = state.opacity * 0.9
      handle.head.scale.setScalar(0.02 * state.scale + 0.006)
      // 航跡は進行方向の少し後ろへ、横に伸ばす
      const behind = state.dir === 1 ? -0.03 : 0.03
      handle.wake.position.x = mx + behind
      handle.wake.position.y = my - 0.006
      handle.wake.material.opacity = state.opacity * 0.4
      handle.wake.scale.set(0.09 * state.scale + 0.02, 0.02 * state.scale + 0.008, 1)
    })
  }

  function updateCar(elapsedMs: number): void {
    const state = carTrail(elapsedMs)
    if (!state.active) {
      carSprite.material.opacity = 0
      return
    }
    const [u, v] = sampleSpline(FOREGROUND_ROAD_PATH, state.t)
    const [mx, my] = imageToMarker(u, v)
    carSprite.position.x = mx
    carSprite.position.y = my
    carSprite.material.opacity = state.opacity * 0.8
  }

  function updateOverlays(elapsedMs: number): void {
    ;(afterglow.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.32 * skyBreath(elapsedMs)
    grainTex.offset.set((elapsedMs / 1000) % 1, (elapsedMs / 1370) % 1)
  }

  function update(elapsedMs: number, viewX: number, viewY: number): void {
    applyParallax(elapsedMs, viewX, viewY)
    updateGlows(elapsedMs)
    updateBridge(elapsedMs)
    updateBoats(elapsedMs)
    updateCar(elapsedMs)
    updateOverlays(elapsedMs)
  }

  function dispose(): void {
    for (const d of disposables) d.dispose()
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) {
        const mesh = obj as THREE.Mesh
        if ('geometry' in mesh && mesh.geometry) mesh.geometry.dispose?.()
        const material = (obj as THREE.Mesh).material
        const materials = Array.isArray(material) ? material : [material]
        for (const m of materials) m?.dispose?.()
      }
    })
  }

  return { object: root, update, dispose }
}
