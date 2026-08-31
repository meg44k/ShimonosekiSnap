// Canvas 2D で生成する発光・大気表現用テクスチャ。外部画像は使わない
// (角島の sparkle/splash と同じ方針。ライセンス表記不要)。生成物は
// 解像度非依存でにじまないため、写真ピクセルを直接光らせるより上質。

import * as THREE from 'three'

function canvas2d(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return [canvas, canvas.getContext('2d')]
}

function finish(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
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
