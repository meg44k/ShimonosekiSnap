import { describe, expect, it } from 'vitest'
import { getLocation, listLocations } from './index'

describe('locations registry', () => {
  it('returns the tsunoshima location by id', () => {
    const location = getLocation('tsunoshima')
    expect(location).toBeDefined()
    expect(location?.id).toBe('tsunoshima')
    expect(location?.name).toBe('角島大橋')
    expect(location?.targetSrc).toBe('targets/tunoshima.mind')
  })

  it('returns undefined for an unknown id', () => {
    expect(getLocation('nonexistent')).toBeUndefined()
  })

  it('lists all registered locations, including tsunoshima', () => {
    const locations = listLocations()
    expect(locations.some((location) => location.id === 'tsunoshima')).toBe(true)
  })
})
