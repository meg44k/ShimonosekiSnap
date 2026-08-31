import { describe, expect, it } from 'vitest'
import { parallaxOffset, viewVector, type ParallaxLayer } from './parallax'

describe('viewVector', () => {
  it('is zero at the centre', () => {
    expect(viewVector(0, 0)).toEqual([0, 0])
  })

  it('saturates towards +/-1 for large offsets', () => {
    const [x, y] = viewVector(10, -10)
    expect(x).toBeGreaterThan(0.99)
    expect(x).toBeLessThanOrEqual(1)
    expect(y).toBeLessThan(-0.99)
    expect(y).toBeGreaterThanOrEqual(-1)
  })

  it('is odd (sign-preserving) and monotonic near the origin', () => {
    expect(viewVector(0.01, 0)[0]).toBeGreaterThan(0)
    expect(viewVector(-0.01, 0)[0]).toBeLessThan(0)
    expect(viewVector(0.02, 0)[0]).toBeGreaterThan(viewVector(0.01, 0)[0])
  })
})

describe('parallaxOffset', () => {
  const near: ParallaxLayer = { z: 0.046, boost: 4, maxShift: 0.08 }
  const far: ParallaxLayer = { z: -0.045, boost: 4, maxShift: 0.08 }

  it('produces no shift when the view is centred', () => {
    expect(parallaxOffset(0, 0, near)).toEqual([0, 0])
  })

  it('shifts a near layer opposite to the view direction', () => {
    const [ox] = parallaxOffset(0.5, 0, near)
    expect(ox).toBeLessThan(0)
  })

  it('shifts a far layer with the view direction (opposite sign to near)', () => {
    const [nearX] = parallaxOffset(0.5, 0, near)
    const [farX] = parallaxOffset(0.5, 0, far)
    expect(Math.sign(farX)).toBe(-Math.sign(nearX))
  })

  it('never exceeds maxShift', () => {
    const [ox, oy] = parallaxOffset(1, 1, { z: 0.046, boost: 999, maxShift: 0.05 })
    expect(Math.abs(ox)).toBeLessThanOrEqual(0.05)
    expect(Math.abs(oy)).toBeLessThanOrEqual(0.05)
  })

  it('scales linearly with the view offset while below the clamp', () => {
    const small = parallaxOffset(0.1, 0, near)[0]
    const twice = parallaxOffset(0.2, 0, near)[0]
    expect(twice).toBeCloseTo(small * 2, 6)
  })
})
