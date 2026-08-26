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
})
