import { describe, expect, it } from 'vitest'
import { resolveLocation } from './App'

describe('resolveLocation', () => {
  it('returns null for the root path', () => {
    expect(resolveLocation('/')).toBeNull()
  })

  it('returns the location config for a known spot', () => {
    const location = resolveLocation('/spot/tsunoshima')
    expect(location?.id).toBe('tsunoshima')
  })

  it('returns the karato face-filter config', () => {
    const location = resolveLocation('/spot/karato')
    expect(location?.id).toBe('karato')
    expect(location?.cameraMode).toBe('person-detection')
  })

  it('returns null for an unknown spot id', () => {
    expect(resolveLocation('/spot/doesnotexist')).toBeNull()
  })

  it('returns null for a malformed percent-encoded spot id', () => {
    expect(resolveLocation('/spot/%')).toBeNull()
  })
})
