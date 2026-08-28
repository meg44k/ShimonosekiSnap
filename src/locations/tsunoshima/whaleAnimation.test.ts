import { describe, expect, it } from 'vitest'
import { CYCLE_DURATION_MS, getWhaleTransform } from './whaleAnimation'

describe('getWhaleTransform', () => {
  it('starts at the first waypoint and is visible at the beginning of a cycle', () => {
    const result = getWhaleTransform(0)
    expect(result.visible).toBe(true)
    expect(result.position[0]).toBeCloseTo(-0.2656, 3)
    expect(result.position[1]).toBeCloseTo(-0.5, 3)
    expect(result.position[2]).toBeCloseTo(0, 3)
  })

  it('is at the interpolated midpoint halfway through the flight', () => {
    const result = getWhaleTransform(2750)
    expect(result.visible).toBe(true)
    expect(result.position[0]).toBeCloseTo(0.0372, 3)
    expect(result.position[1]).toBeCloseTo(0.14, 3)
    expect(result.position[2]).toBeCloseTo(0.04, 3)
  })

  it('starts and ends below sea level so the group-visibility cutoff never fires while the whale is still poking through the clipping plane (loadWhaleModel.ts SEA_LEVEL_Y = -0.07)', () => {
    const SEA_LEVEL_Y = -0.07
    const atStart = getWhaleTransform(0)
    const atEnd = getWhaleTransform(5498)
    expect(atStart.position[1]).toBeLessThan(SEA_LEVEL_Y)
    expect(atEnd.position[1]).toBeLessThan(SEA_LEVEL_Y)
  })

  it('is hidden during the pause after the flight completes', () => {
    const atFlightEnd = getWhaleTransform(5500)
    expect(atFlightEnd.visible).toBe(false)

    const midPause = getWhaleTransform(6000)
    expect(midPause.visible).toBe(false)
  })

  it('loops back to the same transform every CYCLE_DURATION_MS', () => {
    const first = getWhaleTransform(100)
    const secondCycle = getWhaleTransform(CYCLE_DURATION_MS + 100)
    expect(secondCycle).toEqual(first)
  })

  // whale.glbは無回転(rotationX=rotationY=0)のとき、モデルのローカル+Z軸が
  // 頭の向きになっている(Three.jsの簡易検証シーンで実測済み)。Three.jsの
  // デフォルトEuler合成順序(XYZ)でこれを計算すると、頭のワールドY成分は
  // -sin(rotationX)になる。つまり鼻先を上に向けたい(上昇中)ときは
  // rotationXは負の値、鼻先を下に向けたい(下降中)ときは正の値になる
  // (直感とは逆符号なので注意)。
  it('pitches the nose upward (negative rotationX, given local +Z = head) while launching out of the water at the start of the flight', () => {
    const result = getWhaleTransform(0)
    expect(result.rotationX).toBeLessThan(-0.3)
  })

  it('pitches the nose downward (positive rotationX, given local +Z = head) while diving back in near the end of the flight', () => {
    const result = getWhaleTransform(5363)
    expect(result.rotationX).toBeGreaterThan(0.3)
  })

  it('is roughly level (near-zero pitch) at the weightless apex of the arc', () => {
    const result = getWhaleTransform(2750)
    expect(Math.abs(result.rotationX)).toBeLessThan(0.2)
  })

  it('swims at full speed near launch and slows to a near-stop at the weightless apex', () => {
    const atLaunch = getWhaleTransform(0)
    const atApex = getWhaleTransform(2750)
    expect(atLaunch.animationSpeed).toBeCloseTo(1, 5)
    expect(atApex.animationSpeed).toBeLessThan(0.3)
    expect(atApex.animationSpeed).toBeGreaterThan(0)
  })

  it('has zero pitch on the hidden transform used during the pause', () => {
    const atFlightEnd = getWhaleTransform(5500)
    expect(atFlightEnd.rotationX).toBe(0)
  })
})
