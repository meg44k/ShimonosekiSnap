import { describe, expect, it } from 'vitest'
import { getAkamaTransform } from './akamaAnimation'

describe('getAkamaTransform', () => {
  it('returns a visible transform at elapsedMs = 0', () => {
    const result = getAkamaTransform(0)
    expect(result.visible).toBe(true)
    expect(result.position[0]).toBe(0)
    expect(result.position[1]).toBeCloseTo(0, 4)
    expect(result.position[2]).toBe(0)
    expect(result.rotationY).toBe(0)
  })

  it('remains visible and applies smooth subtle floating over time', () => {
    const midCycle = getAkamaTransform(750) // 1/4 cycle (sin = 1)
    expect(midCycle.visible).toBe(true)
    expect(midCycle.position[1]).toBeCloseTo(0.008, 4)

    const threeQuarterCycle = getAkamaTransform(2250) // 3/4 cycle (sin = -1)
    expect(threeQuarterCycle.visible).toBe(true)
    expect(threeQuarterCycle.position[1]).toBeCloseTo(-0.008, 4)
  })
})
