import { describe, expect, it } from 'vitest'
import { extractLightPoints, rgbaToLuma } from './lightField'

/** width*height のグリッドを作り、指定セルに値を置く */
function grid(width: number, height: number, fill = 0): Float32Array {
  return new Float32Array(width * height).fill(fill)
}
const idx = (w: number, x: number, y: number) => y * w + x

describe('extractLightPoints', () => {
  it('returns nothing for an all-dark field', () => {
    expect(extractLightPoints(grid(16, 16, 0.1), 16, 16)).toEqual([])
  })

  it('finds a single bright pixel at its centre', () => {
    const w = 16
    const h = 16
    const g = grid(w, h, 0.1)
    g[idx(w, 5, 9)] = 0.95
    const points = extractLightPoints(g, w, h)
    expect(points).toHaveLength(1)
    expect(points[0].u).toBeCloseTo((5 + 0.5) / w, 6)
    expect(points[0].v).toBeCloseTo((9 + 0.5) / h, 6)
    expect(points[0].intensity).toBeCloseTo(0.95, 6)
  })

  it('collapses a bright plateau to about one point via non-max suppression', () => {
    const w = 20
    const h = 20
    const g = grid(w, h, 0.05)
    for (let y = 8; y <= 12; y++) {
      for (let x = 8; x <= 12; x++) g[idx(w, x, y)] = 0.9
    }
    // 25 個の等値セルが候補になるが、抑制半径がプレートより広ければ 1 点に畳まれる
    expect(extractLightPoints(g, w, h, { suppressionRadius: 8 })).toHaveLength(1)
    // 半径がプレート幅と同程度なら数点に収まる(25 のままにはならない)
    expect(extractLightPoints(g, w, h, { suppressionRadius: 4 }).length).toBeLessThanOrEqual(4)
  })

  it('separates two well-spaced blobs', () => {
    const w = 40
    const h = 20
    const g = grid(w, h, 0.05)
    g[idx(w, 6, 10)] = 0.8
    g[idx(w, 32, 10)] = 0.85
    const points = extractLightPoints(g, w, h, { suppressionRadius: 3 })
    expect(points).toHaveLength(2)
    // brightest first
    expect(points[0].intensity).toBeGreaterThan(points[1].intensity)
  })

  it('respects the threshold', () => {
    const w = 16
    const h = 16
    const g = grid(w, h, 0.1)
    g[idx(w, 4, 4)] = 0.5
    expect(extractLightPoints(g, w, h, { threshold: 0.6 })).toEqual([])
    expect(extractLightPoints(g, w, h, { threshold: 0.4 })).toHaveLength(1)
  })

  it('caps the result at maxPoints, keeping the brightest', () => {
    const w = 50
    const h = 50
    const g = grid(w, h, 0.05)
    let n = 0
    for (let y = 2; y < h; y += 4) {
      for (let x = 2; x < w; x += 4) {
        g[idx(w, x, y)] = 0.6 + (n % 20) / 100
        n++
      }
    }
    const points = extractLightPoints(g, w, h, { maxPoints: 10, suppressionRadius: 1 })
    expect(points).toHaveLength(10)
    for (let i = 1; i < points.length; i++) {
      expect(points[i - 1].intensity).toBeGreaterThanOrEqual(points[i].intensity)
    }
  })

  it('guards against malformed input', () => {
    expect(extractLightPoints([], 0, 0)).toEqual([])
    expect(extractLightPoints(new Float32Array(3), 4, 4)).toEqual([])
  })
})

describe('rgbaToLuma', () => {
  it('maps white to 1 and black to 0', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255])
    const luma = rgbaToLuma(rgba, 2, 1)
    expect(luma[0]).toBeCloseTo(1, 5)
    expect(luma[1]).toBeCloseTo(0, 5)
  })

  it('weights green most heavily (Rec.601)', () => {
    const rgba = new Uint8ClampedArray([0, 255, 0, 255])
    expect(rgbaToLuma(rgba, 1, 1)[0]).toBeCloseTo(0.587, 3)
  })
})
