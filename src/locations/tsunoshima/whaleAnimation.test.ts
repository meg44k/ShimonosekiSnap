import { describe, expect, it } from 'vitest'
import { CYCLE_DURATION_MS, getWhaleTransform } from './whaleAnimation'

describe('getWhaleTransform', () => {
  it('starts at the first waypoint and is visible at the beginning of a cycle', () => {
    const result = getWhaleTransform(0)
    expect(result.visible).toBe(true)
    expect(result.position[0]).toBeCloseTo(-0.2656, 3)
    expect(result.position[1]).toBeCloseTo(-0.0965, 3)
    expect(result.position[2]).toBeCloseTo(0, 3)
  })

  it('is at the interpolated midpoint halfway through the flight', () => {
    const result = getWhaleTransform(2000)
    expect(result.visible).toBe(true)
    expect(result.position[0]).toBeCloseTo(0.0372, 3)
    expect(result.position[1]).toBeCloseTo(0.0977, 3)
    expect(result.position[2]).toBeCloseTo(0.04, 3)
  })

  it('is hidden during the pause after the flight completes', () => {
    const atFlightEnd = getWhaleTransform(4000)
    expect(atFlightEnd.visible).toBe(false)

    const midPause = getWhaleTransform(4500)
    expect(midPause.visible).toBe(false)
  })

  it('loops back to the same transform every CYCLE_DURATION_MS', () => {
    const first = getWhaleTransform(100)
    const secondCycle = getWhaleTransform(CYCLE_DURATION_MS + 100)
    expect(secondCycle).toEqual(first)
  })

  it('pitches the nose upward while launching out of the water at the start of the flight', () => {
    const result = getWhaleTransform(0)
    expect(result.rotationX).toBeGreaterThan(0.3)
  })

  it('pitches the nose downward while diving back in near the end of the flight', () => {
    const result = getWhaleTransform(3900)
    expect(result.rotationX).toBeLessThan(-0.3)
  })

  it('is roughly level (near-zero pitch) at the weightless apex of the arc', () => {
    const result = getWhaleTransform(2000)
    expect(Math.abs(result.rotationX)).toBeLessThan(0.2)
  })

  it('swims at full speed near launch and slows to a near-stop at the weightless apex', () => {
    const atLaunch = getWhaleTransform(0)
    const atApex = getWhaleTransform(2000)
    expect(atLaunch.animationSpeed).toBeCloseTo(1, 5)
    expect(atApex.animationSpeed).toBeLessThan(0.3)
    expect(atApex.animationSpeed).toBeGreaterThan(0)
  })

  it('has zero pitch on the hidden transform used during the pause', () => {
    const atFlightEnd = getWhaleTransform(4000)
    expect(atFlightEnd.rotationX).toBe(0)
  })
})
