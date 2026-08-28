import { describe, expect, it } from 'vitest'
import { CYCLE_DURATION_MS } from './whaleAnimation'
import { detectSplashCrossing } from './splashTrigger'

// getWhaleTransform()のY座標は t≈0.21359(elapsedMs≈1175ms)で離水方向に、
// t≈0.78641(elapsedMs≈4325ms)で着水方向にSEA_LEVEL_Y(-0.07)を横切る
// (WAYPOINTSから導いたベジェ曲線 y(t) = -0.5 + 2.56t(1-t) を -0.07 で解いた値。
// FLIGHT_DURATION_MSが5500msのため、tの割合に5500を掛けた値)。
describe('detectSplashCrossing', () => {
  it('detects an exit splash when the whale rises through sea level while launching', () => {
    const event = detectSplashCrossing(1150, 1200)
    expect(event).not.toBeNull()
    expect(event?.kind).toBe('exit')
  })

  it('detects an entry splash when the whale dives back through sea level near the end', () => {
    const event = detectSplashCrossing(4300, 4350)
    expect(event).not.toBeNull()
    expect(event?.kind).toBe('entry')
  })

  it('returns null while the whale is airborne well above sea level', () => {
    expect(detectSplashCrossing(2700, 2750)).toBeNull()
  })

  it('returns null while the whale is submerged well below sea level', () => {
    expect(detectSplashCrossing(0, 30)).toBeNull()
  })

  it('returns null during the pause when the whale is hidden', () => {
    expect(detectSplashCrossing(5500, 5516)).toBeNull()
  })

  it('returns null across a cycle boundary (hidden -> visible) even though the raw Y jumps', () => {
    const prev = CYCLE_DURATION_MS - 10
    const curr = CYCLE_DURATION_MS + 10
    expect(detectSplashCrossing(prev, curr)).toBeNull()
  })

  it('returns the crossing-frame position for use as the splash spawn point', () => {
    const event = detectSplashCrossing(1150, 1200)
    expect(event).not.toBeNull()
    expect(event?.position[0]).toBeCloseTo(-0.1311, 3)
    expect(event?.position[1]).toBeCloseTo(-0.0633, 3)
    expect(event?.position[2]).toBeCloseTo(0.0273, 3)
  })

  it('returns null when elapsedMs does not advance', () => {
    expect(detectSplashCrossing(2000, 2000)).toBeNull()
  })
})
