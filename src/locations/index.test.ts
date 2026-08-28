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

  it('returns the kaikyokan location by id', () => {
    const location = getLocation('kaikyokan')
    expect(location).toBeDefined()
    expect(location?.id).toBe('kaikyokan')
    expect(location?.name).toBe('海響館')
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

  it('lists all registered locations, including tsunoshima, akama, yumetower, and kaikyokan', () => {
    const locations = listLocations()
    expect(locations.some((location) => location.id === 'tsunoshima')).toBe(true)
    expect(locations.some((location) => location.id === 'akama')).toBe(true)
    expect(locations.some((location) => location.id === 'yumetower')).toBe(true)
    expect(locations.some((location) => location.id === 'kaikyokan')).toBe(true)
  })

  it('has no duplicate ids among registered locations', () => {
    const ids = listLocations().map((location) => location.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
