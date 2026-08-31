// Canvas 2D で生成する発光・オーバーレイ用テクスチャ。外部画像は使わない
// (角島の sparkle/splash と同じ方針。ライセンス表記不要)。生成物は
// 解像度非依存でにじまないため、写真ピクセルを直接光らせるより上質。

import * as THREE from 'three'
import { SKY_GRADIENT_STOPS } from './sceneTrace'

function canvas2d(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return [canvas, canvas.getContext('2d')]
}

function finish(canvas: HTMLCanvasElement, opts: { repeat?: boolean } = {}): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  if (opts.repeat) {
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
  }
  texture.needsUpdate = true
  return texture
}

/** 中心が鋭く、裾が長い柔らかな光。加算合成のグロースプライト用 */
export function createGlowTexture(size = 128): THREE.CanvasTexture {
  const [canvas, ctx] = canvas2d(size, size)
  if (ctx) {
    const r = size / 2
    const g = ctx.createRadialGradient(r, r, 0, r, r, r)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.12, 'rgba(255,255,255,0.92)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.35)')
    g.addColorStop(0.7, 'rgba(255,255,255,0.08)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  return finish(canvas)
}

/** 横に伸びるアナモルフィック風の筋。明るい点に薄く重ねる */
export function createStreakTexture(width = 256, height = 32): THREE.CanvasTexture {
  const [canvas, ctx] = canvas2d(width, height)
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, width, 0)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.9)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    // 縦方向にも軽く減衰させる
    ctx.fillRect(0, 0, width, height)
    const v = ctx.createLinearGradient(0, 0, 0, height)
    v.addColorStop(0, 'rgba(0,0,0,1)')
    v.addColorStop(0.5, 'rgba(0,0,0,0)')
    v.addColorStop(1, 'rgba(0,0,0,1)')
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = v
    ctx.fillRect(0, 0, width, height)
  }
  return finish(canvas)
}

/** 薄明の空。SKY_GRADIENT_STOPS の縦グラデ + 上部にごく淡い星 */
export function createSkyTexture(width = 512, height = 768): THREE.CanvasTexture {
  const [canvas, ctx] = canvas2d(width, height)
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, height)
    for (const stop of SKY_GRADIENT_STOPS) g.addColorStop(stop.y, stop.color)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, width, height)
    // 星: 上 45% にだけ、非常に小さく散らす
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    let seed = 1337
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    for (let i = 0; i < 220; i++) {
      const x = rand() * width
      const y = rand() * height * 0.45
      const r = rand() * 0.9 + 0.2
      ctx.globalAlpha = 0.3 + rand() * 0.5
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
  return finish(canvas)
}

/** 水平線付近の暖色の残照。skyBreath で不透明度を揺らす加算プレーン用 */
export function createAfterglowTexture(width = 512, height = 256): THREE.CanvasTexture {
  const [canvas, ctx] = canvas2d(width, height)
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, height)
    g.addColorStop(0, 'rgba(255,150,90,0)')
    g.addColorStop(0.55, 'rgba(255,150,95,0.5)')
    g.addColorStop(0.8, 'rgba(255,180,130,0.85)')
    g.addColorStop(1, 'rgba(255,205,165,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, width, height)
  }
  return finish(canvas)
}

/** タイル可能なモノクロ粒子ノイズ。微量の加算で「フィルムの粒」を出す */
export function createGrainTexture(size = 256): THREE.CanvasTexture {
  const [canvas, ctx] = canvas2d(size, size)
  if (ctx) {
    const image = ctx.createImageData(size, size)
    let seed = 91237
    for (let i = 0; i < size * size; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0
      const n = seed % 256
      image.data[i * 4] = n
      image.data[i * 4 + 1] = n
      image.data[i * 4 + 2] = n
      image.data[i * 4 + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
  }
  return finish(canvas, { repeat: true })
}

/** 中心透明・周縁が暗いヴィネット。通常合成で前面に薄く重ねる */
export function createVignetteTexture(size = 512): THREE.CanvasTexture {
  const [canvas, ctx] = canvas2d(size, size)
  if (ctx) {
    const r = size / 2
    const g = ctx.createRadialGradient(r, r, r * 0.55, r, r, r * 1.02)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(0.8, 'rgba(0,0,0,0.35)')
    g.addColorStop(1, 'rgba(0,0,0,0.7)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  return finish(canvas)
}
