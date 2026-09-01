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

  it('returns the location config for akama spot', () => {
    const location = resolveLocation('/spot/akama')
    expect(location?.id).toBe('akama')
    expect(location?.name).toBe('赤間神宮')
  })

  it('returns the location config for yumetower spot', () => {
    const location = resolveLocation('/spot/yumetower')
    expect(location?.id).toBe('yumetower')
    expect(location?.name).toBe('海峡ゆめタワー')
  })

  it('returns the location config for kaikyokan spot', () => {
    const location = resolveLocation('/spot/kaikyokan')
    expect(location?.id).toBe('kaikyokan')
    expect(location?.name).toBe('海響館')
  })

  it('returns the location config for ganryujima spot', () => {
    const location = resolveLocation('/spot/ganryujima')
    expect(location?.id).toBe('ganryujima')
    expect(location?.name).toBe('巌流島')
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
