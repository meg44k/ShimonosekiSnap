import { describe, expect, it } from 'vitest'
import { gradeImageData, gradePixel, NIGHT_GRADE, type GradeParams } from './imageGrade'

const IDENTITY: GradeParams = {
  lift: [0, 0, 0],
  gamma: [1, 1, 1],
  gain: [1, 1, 1],
  saturation: 1,
  toneMap: false,
}

describe('gradePixel', () => {
  it('is a no-op under identity parameters', () => {
    expect(gradePixel(0.2, 0.5, 0.8, IDENTITY)).toEqual([0.2, 0.5, 0.8])
  })

  it('lift raises the black point', () => {
    const [r, g, b] = gradePixel(0, 0, 0, { ...IDENTITY, lift: [0.2, 0.2, 0.2] })
    expect(r).toBeCloseTo(0.2, 6)
    expect(g).toBeCloseTo(0.2, 6)
    expect(b).toBeCloseTo(0.2, 6)
  })

  it('gain brightens midtones', () => {
    expect(gradePixel(0.5, 0.5, 0.5, { ...IDENTITY, gain: [1.2, 1.2, 1.2] })[0]).toBeCloseTo(0.6, 6)
  })

  it('gamma > 1 lifts the middle', () => {
    expect(gradePixel(0.5, 0.5, 0.5, { ...IDENTITY, gamma: [2, 2, 2] })[0]).toBeCloseTo(
      Math.SQRT1_2,
      6,
    )
  })

  it('saturation 0 collapses to luma on every channel', () => {
    const [r, g, b] = gradePixel(0.8, 0.4, 0.1, { ...IDENTITY, saturation: 0 })
    expect(r).toBeCloseTo(g, 6)
    expect(g).toBeCloseTo(b, 6)
  })

  it('keeps output within [0,1] even for out-of-gamut requests', () => {
    const hot: GradeParams = { ...IDENTITY, gain: [4, 4, 4], lift: [0.5, 0.5, 0.5] }
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      for (const c of gradePixel(v, v, v, hot)) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
    }
  })

  it('tone mapping is monotonic', () => {
    let prev = -1
    for (let i = 0; i <= 20; i++) {
      const out = gradePixel(i / 20, i / 20, i / 20, { ...IDENTITY, toneMap: true })[0]
      expect(out).toBeGreaterThanOrEqual(prev)
      prev = out
    }
  })
})

describe('gradeImageData', () => {
  it('mutates RGB in place and leaves alpha untouched', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 123, 255, 255, 255, 200])
    gradeImageData(data, { ...IDENTITY, lift: [0.5, 0.5, 0.5] })
    expect(data[0]).toBeCloseTo(128, -1)
    expect(data[3]).toBe(123)
    expect(data[7]).toBe(200)
  })
})

describe('NIGHT_GRADE', () => {
  it('tints the shadows cool (blue lifted above red)', () => {
    const [r, , b] = gradePixel(0, 0, 0, NIGHT_GRADE)
    expect(b).toBeGreaterThan(r)
  })

  it('produces in-range output across a full luminance sweep', () => {
    for (let i = 0; i <= 32; i++) {
      const v = i / 32
      for (const c of gradePixel(v, v, v, NIGHT_GRADE)) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
    }
  })
})
