// 火の山「動く夜景」— 平面版。マーカー(印刷パネル)の上に、色補正した夜景写真を
// 1 枚貼り、その上で光と動きだけを高品質に見せる。奥行きレイヤー分割・視差は持たない。
// 発光は写真ピクセルを直接光らせず、輝度から抽出した実際の光位置に生成スプライトを置く。

import * as THREE from 'three'
import { gradeImageData, NIGHT_GRADE } from './imageGrade'
import { extractLightPoints, rgbaToLuma } from './lightField'
import { boats, beacon, bridgeShimmer, carTrail, skyBreath, twinkle } from './motionTimeline'
import {
  BRIDGE_BEACON_UV,
  BRIDGE_PATH,
  CITY_LIGHT_REGIONS,
  FOREGROUND_ROAD_PATH,
  imageToMarker,
  MARKER_ASPECT,
  pointInPolygon,
  sampleSpline,
  STRAIT_PATH,
} from './sceneTrace'
import {
  createAfterglowTexture,
  createGlowTexture,
  createGrainTexture,
  createVignetteTexture,
} from './textures'

/** 処理に使う写真の最大幅(px)。元画像が上回る場合は縮小 */
const WORK_MAX_WIDTH = 1280
/** この輝度以上を「光源」とみなす(グロー抽出 / ソフトブルーム) */
const LIGHT_THRESHOLD = 0.6

type RenderOrder = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

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

export interface NightSceneModel {
  object: THREE.Group
  update(elapsedMs: number): void
}

// --- 写真のデコードと色補正 ------------------------------------------

interface Decoded {
  gradedCanvas: HTMLCanvasElement
  luma: Float32Array
  width: number
  height: number
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return [canvas, canvas.getContext('2d', { willReadFrequently: true })]
}

function decodeAndGrade(image: CanvasImageSource & { width: number; height: number }): Decoded {
  const width = Math.min(WORK_MAX_WIDTH, image.width)
  const height = Math.round((width / image.width) * image.height)
  const [canvas, ctx] = makeCanvas(width, height)
  if (!ctx) return { gradedCanvas: canvas, luma: new Float32Array(width * height), width, height }
  ctx.drawImage(image, 0, 0, width, height)
  const data = ctx.getImageData(0, 0, width, height)
  gradeImageData(data.data, NIGHT_GRADE)
  ctx.putImageData(data, 0, 0)
  return { gradedCanvas: canvas, luma: rgbaToLuma(data.data, width, height), width, height }
}

function photoTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

/** 明るい部分だけ残してぼかした、写真のソフトブルーム版テクスチャ */
function bloomTexture(decoded: Decoded): THREE.CanvasTexture {
  const { width, height } = decoded
  const [bright, bctx] = makeCanvas(width, height)
  if (bctx) {
    bctx.drawImage(decoded.gradedCanvas, 0, 0)
    const data = bctx.getImageData(0, 0, width, height)
    for (let i = 0; i < width * height; i++) {
      const lum = decoded.luma[i]
      const k = lum <= LIGHT_THRESHOLD ? 0 : (lum - LIGHT_THRESHOLD) / (1 - LIGHT_THRESHOLD)
      data.data[i * 4] *= k
      data.data[i * 4 + 1] *= k
      data.data[i * 4 + 2] *= k
    }
    bctx.putImageData(data, 0, 0)
  }
  const [blurred, cctx] = makeCanvas(width, height)
  if (cctx) {
    cctx.filter = `blur(${Math.max(2, width * 0.012)}px)`
    cctx.drawImage(bright, 0, 0)
  }
  return photoTexture(blurred)
}

// --- スプライト ------------------------------------------------------

function makeGlow(map: THREE.Texture, color: THREE.Color, scale: number, opacity: number): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map,
      color,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  )
  sprite.scale.setScalar(scale)
  return sprite
}

function overlayPlane(
  map: THREE.Texture,
  w: number,
  h: number,
  opacity: number,
  additive: boolean,
  order: RenderOrder,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }),
  )
  mesh.renderOrder = order
  return mesh
}

function sampleLightColor(canvas: HTMLCanvasElement, u: number, v: number): THREE.Color {
  const ctx = canvas.getContext('2d')
  const color = new THREE.Color(0xffffff)
  if (!ctx) return color
  const x = Math.min(canvas.width - 1, Math.max(0, Math.round(u * canvas.width)))
  const y = Math.min(canvas.height - 1, Math.max(0, Math.round(v * canvas.height)))
  const [r, g, b] = ctx.getImageData(x, y, 1, 1).data
  color.setRGB(r / 255, g / 255, b / 255)
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl)
  color.setHSL(hsl.h, Math.min(1, hsl.s * 1.5 + 0.12), Math.min(1, hsl.l * 0.55 + 0.5))
  return color
}

// --- 本体 ----------------------------------------------------------

export function buildNightScene(
  image: CanvasImageSource & { width: number; height: number },
): NightSceneModel {
  const root = new THREE.Group()
  const decoded = decodeAndGrade(image)
  const glowTex = createGlowTexture(128)

  // 1. 色補正した写真 -------------------------------------------------
  root.add(overlayPlane(photoTexture(decoded.gradedCanvas), 1, MARKER_ASPECT, 1, false, 0))

  // 2. ソフトブルーム(写真の明部をぼかして加算) --------------------
  root.add(overlayPlane(bloomTexture(decoded), 1, MARKER_ASPECT, 0.4, true, 1))

  // 3. 実光源のグロー ----------------------------------------------
  const glows: GlowHandle[] = []
  const points = extractLightPoints(decoded.luma, decoded.width, decoded.height, {
    threshold: LIGHT_THRESHOLD + 0.04,
    suppressionRadius: 5,
    maxPoints: 200,
  })
  for (const point of points) {
    let warmth = 0.5
    for (const region of CITY_LIGHT_REGIONS) {
      if (pointInPolygon([point.u, point.v], region.polygon)) warmth = region.warmth
    }
    const color = sampleLightColor(decoded.gradedCanvas, point.u, point.v)
    color.lerp(new THREE.Color(warmth > 0.5 ? 0xffb066 : 0xcfe0ff), 0.3)
    const [mx, my] = imageToMarker(point.u, point.v)
    const baseScale = 0.008 + point.intensity * 0.02
    const baseOpacity = 0.2 + point.intensity * 0.45
    const sprite = makeGlow(glowTex, color, baseScale, baseOpacity)
    sprite.position.set(mx, my, 0)
    sprite.renderOrder = 2
    root.add(sprite)
    glows.push({ sprite, baseScale, baseOpacity, seed: Math.round(point.u * 1000 + point.v * 7919) })
  }

  // 4. 船 + 航跡 ---------------------------------------------------
  const boatHandles: BoatHandle[] = []
  for (let i = 0; i < 3; i++) {
    const head = makeGlow(glowTex, new THREE.Color(0xffd9a8), 0.016, 0)
    const wake = makeGlow(glowTex, new THREE.Color(0xbfe6ff), 0.04, 0)
    head.renderOrder = 3
    wake.renderOrder = 3
    root.add(wake)
    root.add(head)
    boatHandles.push({ head, wake })
  }

  // 5. 関門橋: 航空障害灯 + 流れる光 -----------------------------
  const [beaconX, beaconY] = imageToMarker(BRIDGE_BEACON_UV[0], BRIDGE_BEACON_UV[1])
  const beaconSprite = makeGlow(glowTex, new THREE.Color(0xff3b30), 0.024, 0)
  beaconSprite.position.set(beaconX, beaconY, 0)
  beaconSprite.renderOrder = 4
  root.add(beaconSprite)

  const shimmerSprite = makeGlow(glowTex, new THREE.Color(0xfff0d8), 0.045, 0)
  shimmerSprite.renderOrder = 4
  root.add(shimmerSprite)

  // 6. 手前の道路の車テールランプ ------------------------------
  const carSprite = makeGlow(glowTex, new THREE.Color(0xff6a40), 0.026, 0)
  carSprite.renderOrder = 3
  root.add(carSprite)

  // 7. 前面オーバーレイ -----------------------------------------
  const afterglowTex = createAfterglowTexture()
  const afterglow = overlayPlane(afterglowTex, 1.02, MARKER_ASPECT * 0.5, 0, true, 5)
  afterglow.position.set(0, MARKER_ASPECT * 0.1, 0)
  root.add(afterglow)

  const grainTex = createGrainTexture(256)
  grainTex.repeat.set(2.6, 2.6)
  const grain = overlayPlane(grainTex, 1.05, MARKER_ASPECT * 1.05, 0.045, true, 6)
  root.add(grain)

  const vignetteTex = createVignetteTexture()
  root.add(overlayPlane(vignetteTex, 1.05, MARKER_ASPECT * 1.05, 0.5, false, 7))

  // --- 毎フレーム更新 ------------------------------------------
  function update(elapsedMs: number): void {
    for (const glow of glows) {
      const t = twinkle(glow.seed, elapsedMs)
      glow.sprite.material.opacity = glow.baseOpacity * (0.55 + 0.6 * t)
      glow.sprite.scale.setScalar(glow.baseScale * (0.9 + 0.2 * t))
    }

    boats(elapsedMs).forEach((state, i) => {
      const { head, wake } = boatHandles[i]
      if (!state.active) {
        head.material.opacity = 0
        wake.material.opacity = 0
        return
      }
      const [u, v] = sampleSpline(STRAIT_PATH, state.t)
      const [mx, my] = imageToMarker(u, v)
      head.position.set(mx, my, 0)
      head.material.opacity = state.opacity * 0.85
      head.scale.setScalar(0.014 * state.scale + 0.005)
      const behind = state.dir === 1 ? -0.028 : 0.028
      wake.position.set(mx + behind, my - 0.005, 0)
      wake.material.opacity = state.opacity * 0.35
      wake.scale.set(0.08 * state.scale + 0.02, 0.018 * state.scale + 0.007, 1)
    })

    beaconSprite.material.opacity = beacon(elapsedMs)

    const s = bridgeShimmer(elapsedMs)
    const [su, sv] = sampleSpline(BRIDGE_PATH, s)
    const [smx, smy] = imageToMarker(su, sv)
    shimmerSprite.position.set(smx, smy, 0)
    shimmerSprite.material.opacity = 0.65 * Math.sin(Math.PI * s)

    const car = carTrail(elapsedMs)
    if (!car.active) {
      carSprite.material.opacity = 0
    } else {
      const [cu, cv] = sampleSpline(FOREGROUND_ROAD_PATH, car.t)
      const [cmx, cmy] = imageToMarker(cu, cv)
      carSprite.position.set(cmx, cmy, 0)
      carSprite.material.opacity = car.opacity * 0.75
    }

    ;(afterglow.material as THREE.MeshBasicMaterial).opacity = 0.16 + 0.3 * skyBreath(elapsedMs)
    afterglow.position.x = Math.sin(elapsedMs / 9000) * 0.015
    grainTex.offset.set((elapsedMs / 1000) % 1, (elapsedMs / 1370) % 1)
  }

  return { object: root, update }
}
