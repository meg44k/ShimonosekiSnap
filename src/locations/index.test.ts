import { describe, expect, it } from 'vitest'
import { getLocation, listLocations } from './index'

describe('locations registry', () => {
  it('returns the tsunoshima location by id', () => {
    const location = getLocation('tsunoshima')
    expect(location).toBeDefined()
    expect(location?.id).toBe('tsunoshima')
    expect(location?.name).toBe('角島大橋')
    expect(location?.cameraMode).toBe('image-target')
    if (location?.cameraMode === 'image-target') {
      expect(location.targetSrc).toBe('targets/tunoshima.mind')
    }
  })

  it('returns the akama location by id', () => {
    const location = getLocation('akama')
    expect(location).toBeDefined()
    expect(location?.id).toBe('akama')
    expect(location?.name).toBe('赤間神宮')
  })

  it('returns the ganryujima location by id', () => {
    const location = getLocation('ganryujima')
    expect(location).toBeDefined()
    expect(location?.id).toBe('ganryujima')
    expect(location?.name).toBe('巌流島')
  })

  it('registers yumetower as a person-detection location', () => {
    const location = getLocation('yumetower')
    expect(location).toBeDefined()
    expect(location?.id).toBe('yumetower')
    expect(location?.name).toBe('海峡ゆめタワー')
    expect(location?.cameraMode).toBe('person-detection')
  })

  it('returns undefined for an unknown id', () => {
    expect(getLocation('nonexistent')).toBeUndefined()
  })

  it('lists all registered locations, including tsunoshima, akama, yumetower, karato, hinoyama, and ganryujima', () => {
    const locations = listLocations()
    expect(locations.some((location) => location.id === 'tsunoshima')).toBe(true)
    expect(locations.some((location) => location.id === 'akama')).toBe(true)
    expect(locations.some((location) => location.id === 'yumetower')).toBe(true)
    expect(locations.some((location) => location.id === 'karato')).toBe(true)
    expect(locations.some((location) => location.id === 'hinoyama')).toBe(true)
    expect(locations.some((location) => location.id === 'ganryujima')).toBe(true)
  })

  it('registers hinoyama as an image-target night-scene location', () => {
    const location = getLocation('hinoyama')
    expect(location?.name).toBe('火の山公園')
    expect(location?.cameraMode).toBe('image-target')
    if (location?.cameraMode === 'image-target') {
      expect(location.targetSrc).toBe('targets/hinoyama.mind')
      // 動く主役がいないので getTransform は常に可視の定数を返す
      expect(location.effect.getTransform(0).visible).toBe(true)
      expect(location.effect.getTransform(9999)).toEqual(location.effect.getTransform(0))
    }
  })

  it('registers karato with the fugu face filter', () => {
    const location = getLocation('karato')
    expect(location?.name).toBe('唐戸市場')
    expect(location?.cameraMode).toBe('person-detection')
    if (location?.cameraMode === 'person-detection') {
      expect(location.brandLabel).toBe('唐戸市場')
      expect(location.showBrandImage).toBe(true)
      expect(location.overlaySrc).toContain('karato-character.png')
      expect(location.costumeSrc).toContain('fugu-hat.png')
    }
  })

  it('has no duplicate ids among registered locations', () => {
    const ids = listLocations().map((location) => location.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
