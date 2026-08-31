import { describe, expect, it } from 'vitest'
import {
  BRIDGE_PATH,
  CITY_LIGHT_REGIONS,
  imageToMarker,
  LAYER_DEFS,
  MARKER_ASPECT,
  mulberry32,
  pointInPolygon,
  sampleSpline,
  SKY_GRADIENT_STOPS,
  STRAIT_PATH,
} from './sceneTrace'

describe('imageToMarker', () => {
  it('maps the image centre to the origin', () => {
    expect(imageToMarker(0.5, 0.5)).toEqual([0, 0])
  })

  it('maps the top-left corner to (-0.5, +half-height)', () => {
    const [x, y] = imageToMarker(0, 0)
    expect(x).toBeCloseTo(-0.5, 6)
    expect(y).toBeCloseTo(MARKER_ASPECT / 2, 6)
  })

  it('maps the bottom-right corner to (+0.5, -half-height)', () => {
    const [x, y] = imageToMarker(1, 1)
    expect(x).toBeCloseTo(0.5, 6)
    expect(y).toBeCloseTo(-MARKER_ASPECT / 2, 6)
  })
})

describe('LAYER_DEFS', () => {
  it('lists the six depth layers back-to-front', () => {
    expect(LAYER_DEFS.map((l) => l.id)).toEqual(['sky', 'far', 'city', 'water', 'bridge', 'near'])
  })

  it('orders layers by strictly increasing z (back to front)', () => {
    for (let i = 1; i < LAYER_DEFS.length; i++) {
      expect(LAYER_DEFS[i].z).toBeGreaterThan(LAYER_DEFS[i - 1].z)
    }
  })

  it('keeps every layer within +/-0.05 of the marker plane', () => {
    for (const layer of LAYER_DEFS) {
      expect(Math.abs(layer.z)).toBeLessThanOrEqual(0.05)
    }
  })

  it('gives only the sky layer an empty polygon set', () => {
    for (const layer of LAYER_DEFS) {
      if (layer.id === 'sky') expect(layer.polygons).toHaveLength(0)
      else expect(layer.polygons.length).toBeGreaterThan(0)
    }
  })

  it('keeps every polygon vertex inside the image UV square with at least 3 vertices', () => {
    for (const layer of LAYER_DEFS) {
      for (const polygon of layer.polygons) {
        expect(polygon.length).toBeGreaterThanOrEqual(3)
        for (const [u, v] of polygon) {
          expect(u).toBeGreaterThanOrEqual(0)
          expect(u).toBeLessThanOrEqual(1)
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('compensates apparent scale in step with z', () => {
    for (const layer of LAYER_DEFS) {
      expect(layer.scaleComp).toBeCloseTo(1 + layer.z, 2)
    }
  })
})

describe('SKY_GRADIENT_STOPS', () => {
  it('runs from the top of the frame (y=0) to the horizon (y=1) in order', () => {
    expect(SKY_GRADIENT_STOPS[0].y).toBe(0)
    expect(SKY_GRADIENT_STOPS[SKY_GRADIENT_STOPS.length - 1].y).toBe(1)
    for (let i = 1; i < SKY_GRADIENT_STOPS.length; i++) {
      expect(SKY_GRADIENT_STOPS[i].y).toBeGreaterThan(SKY_GRADIENT_STOPS[i - 1].y)
    }
  })

  it('uses hex colours', () => {
    for (const stop of SKY_GRADIENT_STOPS) {
      expect(stop.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('sampleSpline', () => {
  it('returns the first control point at t=0 and the last at t=1', () => {
    const first = sampleSpline(STRAIT_PATH, 0)
    const last = sampleSpline(STRAIT_PATH, 1)
    expect(first[0]).toBeCloseTo(STRAIT_PATH[0][0], 6)
    expect(first[1]).toBeCloseTo(STRAIT_PATH[0][1], 6)
    expect(last[0]).toBeCloseTo(STRAIT_PATH[STRAIT_PATH.length - 1][0], 6)
    expect(last[1]).toBeCloseTo(STRAIT_PATH[STRAIT_PATH.length - 1][1], 6)
  })

  it('advances monotonically along the strait (u increases, v decreases toward the sea)', () => {
    let prevU = -Infinity
    let prevV = Infinity
    for (let i = 0; i <= 20; i++) {
      const [u, v] = sampleSpline(STRAIT_PATH, i / 20)
      expect(u).toBeGreaterThanOrEqual(prevU - 1e-6)
      expect(v).toBeLessThanOrEqual(prevV + 1e-6)
      prevU = u
      prevV = v
    }
  })

  it('clamps t outside [0,1]', () => {
    expect(sampleSpline(BRIDGE_PATH, -1)).toEqual(sampleSpline(BRIDGE_PATH, 0))
    expect(sampleSpline(BRIDGE_PATH, 2)).toEqual(sampleSpline(BRIDGE_PATH, 1))
  })

  it('degrades gracefully for tiny inputs', () => {
    expect(sampleSpline([], 0.5)).toEqual([0, 0])
    expect(sampleSpline([[0.2, 0.3]], 0.5)).toEqual([0.2, 0.3])
  })
})

describe('pointInPolygon', () => {
  const square: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]

  it('detects an interior point', () => {
    expect(pointInPolygon([0.5, 0.5], square)).toBe(true)
  })

  it('rejects an exterior point', () => {
    expect(pointInPolygon([1.5, 0.5], square)).toBe(false)
  })

  it('agrees with the traced 下関 light region', () => {
    const region = CITY_LIGHT_REGIONS[0].polygon
    expect(pointInPolygon([0.2, 0.64], region)).toBe(true)
    expect(pointInPolygon([0.9, 0.64], region)).toBe(false)
  })
})

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('produces values within [0,1)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 500; i++) {
      const x = rng()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  it('gives different streams for different seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })
})
