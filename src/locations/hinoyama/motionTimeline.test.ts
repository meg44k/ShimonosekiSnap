import { describe, expect, it } from 'vitest'
import {
  beacon,
  boats,
  bridgeShimmer,
  carTrail,
  CYCLE_MS,
  hazeDrift,
  meteors,
  METEOR_POOL_SIZE,
  sampleTimeline,
  skyBreath,
  twinkle,
} from './motionTimeline'

describe('CYCLE_MS', () => {
  it('is 24 seconds', () => {
    expect(CYCLE_MS).toBe(24_000)
  })
})

describe('boats', () => {
  it('always returns exactly three slots', () => {
    for (let ms = 0; ms < CYCLE_MS * 2; ms += 250) {
      expect(boats(ms)).toHaveLength(3)
    }
  })

  it('keeps every boat state within valid ranges', () => {
    for (let ms = 0; ms < CYCLE_MS; ms += 137) {
      for (const b of boats(ms)) {
        expect(b.t).toBeGreaterThanOrEqual(0)
        expect(b.t).toBeLessThanOrEqual(1)
        expect(b.opacity).toBeGreaterThanOrEqual(0)
        expect(b.opacity).toBeLessThanOrEqual(1)
        if (b.active) {
          expect(b.scale).toBeGreaterThan(0)
          expect(b.scale).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('runs slot 0 toward the sea and slot 1 back from the sea', () => {
    expect(boats(500)[0].dir).toBe(1)
    expect(boats(9_000)[1].dir).toBe(-1)
  })

  it('moves a forward boat from the near shore toward the sea over its crossing', () => {
    const early = boats(300)[0]
    const late = boats(10_500)[0]
    expect(early.active).toBe(true)
    expect(late.active).toBe(true)
    expect(late.t).toBeGreaterThan(early.t)
    expect(late.scale).toBeLessThan(early.scale)
  })

  it('has at least one and at most three boats visible at the busiest moments', () => {
    let sawMultiple = false
    for (let ms = 0; ms < CYCLE_MS; ms += 100) {
      const count = boats(ms).filter((b) => b.active).length
      expect(count).toBeLessThanOrEqual(3)
      if (count >= 2) sawMultiple = true
    }
    expect(sawMultiple).toBe(true)
  })

  it('marks a slot inactive outside its crossing window', () => {
    const slot0 = boats(13_000)[0] // slot 0 lasts 0..11500
    expect(slot0.active).toBe(false)
    expect(slot0.opacity).toBe(0)
  })

  it('repeats every cycle', () => {
    expect(boats(3_333 + CYCLE_MS)).toEqual(boats(3_333))
  })
})

describe('beacon', () => {
  it('stays within [0,1]', () => {
    for (let ms = 0; ms < 10_000; ms += 7) {
      const v = beacon(ms)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('is lit for well under half of each period', () => {
    let lit = 0
    const samples = 1_600
    for (let i = 0; i < samples; i++) {
      if (beacon(i) > 0.5) lit++
    }
    expect(lit / samples).toBeLessThan(0.4)
  })

  it('is periodic at 1.6 s', () => {
    expect(beacon(320 + 1_600)).toBeCloseTo(beacon(320), 6)
  })
})

describe('bridgeShimmer', () => {
  it('sweeps 0..1 and wraps', () => {
    expect(bridgeShimmer(0)).toBeCloseTo(0, 6)
    expect(bridgeShimmer(4_999)).toBeGreaterThan(0.99)
    expect(bridgeShimmer(5_000)).toBeCloseTo(0, 6)
  })
})

describe('skyBreath', () => {
  it('stays within [0.4, 1] and completes one breath per cycle', () => {
    let min = Infinity
    let max = -Infinity
    for (let ms = 0; ms <= CYCLE_MS; ms += 200) {
      const v = skyBreath(ms)
      min = Math.min(min, v)
      max = Math.max(max, v)
    }
    expect(min).toBeGreaterThanOrEqual(0.4 - 1e-6)
    expect(max).toBeLessThanOrEqual(1 + 1e-6)
    expect(min).toBeLessThan(0.5)
    expect(max).toBeGreaterThan(0.95)
  })

  it('repeats every cycle', () => {
    expect(skyBreath(1_234 + CYCLE_MS)).toBeCloseTo(skyBreath(1_234), 6)
  })
})

describe('hazeDrift', () => {
  it('runs 0..1 across the cycle and wraps', () => {
    expect(hazeDrift(0)).toBeCloseTo(0, 6)
    expect(hazeDrift(CYCLE_MS - 1)).toBeGreaterThan(0.99)
    expect(hazeDrift(CYCLE_MS)).toBeCloseTo(0, 6)
  })
})

describe('twinkle', () => {
  it('stays within [0,1] for many seeds and times', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (let ms = 0; ms < 30_000; ms += 133) {
        const v = twinkle(seed, ms)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })

  it('is deterministic', () => {
    expect(twinkle(5, 1_234)).toBe(twinkle(5, 1_234))
  })

  it('differs between seeds and varies over time', () => {
    expect(twinkle(1, 2_000)).not.toBe(twinkle(2, 2_000))
    expect(twinkle(1, 2_000)).not.toBe(twinkle(1, 5_000))
  })
})

describe('carTrail', () => {
  it('is active only a small fraction of the time, with bounded output', () => {
    let active = 0
    const samples = 3_200
    for (let i = 0; i < samples; i++) {
      const s = carTrail(i * 10)
      expect(s.t).toBeGreaterThanOrEqual(0)
      expect(s.t).toBeLessThanOrEqual(1)
      expect(s.opacity).toBeGreaterThanOrEqual(0)
      expect(s.opacity).toBeLessThanOrEqual(1)
      if (s.active) active++
    }
    expect(active / samples).toBeLessThan(0.25)
  })
})

describe('meteors', () => {
  it('always returns a fixed-length pool', () => {
    for (let ms = 0; ms < CYCLE_MS * 2; ms += 90) {
      expect(meteors(ms)).toHaveLength(METEOR_POOL_SIZE)
    }
  })

  it('keeps progress, intensity and pathIndex within valid ranges', () => {
    for (let ms = 0; ms < CYCLE_MS; ms += 53) {
      for (const m of meteors(ms, 10)) {
        expect(m.progress).toBeGreaterThanOrEqual(0)
        expect(m.progress).toBeLessThanOrEqual(1)
        expect(m.intensity).toBeGreaterThanOrEqual(0)
        expect(m.intensity).toBeLessThanOrEqual(1)
        expect(m.pathIndex).toBeGreaterThanOrEqual(0)
        expect(m.pathIndex).toBeLessThan(10)
      }
    }
  })

  it('has quiet stretches and busy peaks (a real shower, not a drizzle)', () => {
    let sawEmpty = false
    let peak = 0
    for (let ms = 0; ms < CYCLE_MS; ms += 40) {
      const count = meteors(ms).filter((m) => m.active).length
      if (count === 0) sawEmpty = true
      peak = Math.max(peak, count)
    }
    expect(sawEmpty).toBe(true)
    expect(peak).toBeGreaterThanOrEqual(3)
  })

  it('never exceeds the pool with simultaneously active meteors', () => {
    for (let ms = 0; ms < CYCLE_MS; ms += 25) {
      expect(meteors(ms).filter((m) => m.active).length).toBeLessThanOrEqual(METEOR_POOL_SIZE)
    }
  })

  it('fires two showers per cycle', () => {
    // 立ち上がりエッジ(前フレーム 0 本 → 今フレーム >0 本)の回数
    let edges = 0
    let prev = 0
    for (let ms = 0; ms < CYCLE_MS; ms += 20) {
      const count = meteors(ms).filter((m) => m.active).length
      if (prev === 0 && count > 0) edges++
      prev = count
    }
    expect(edges).toBe(2)
  })

  it('repeats every cycle', () => {
    expect(meteors(6_200 + CYCLE_MS)).toEqual(meteors(6_200))
  })

  it('marks unused pool slots inactive', () => {
    const quiet = meteors(12_000) // 群れと群れの間
    expect(quiet.every((m) => !m.active)).toBe(true)
  })
})

describe('sampleTimeline', () => {
  it('bundles every channel', () => {
    const s = sampleTimeline(5_000)
    expect(Object.keys(s).sort()).toEqual(
      ['beacon', 'boats', 'bridgeShimmer', 'carTrail', 'hazeDrift', 'meteors', 'skyBreath'].sort(),
    )
    expect(s.boats).toHaveLength(3)
    expect(s.meteors).toHaveLength(METEOR_POOL_SIZE)
  })
})
