import { describe, expect, it } from 'vitest'
import { parseRoute } from './router'

describe('parseRoute', () => {
  it('returns root for the root path', () => {
    expect(parseRoute('/')).toEqual({ type: 'root' })
  })

  it('returns spot with the id for a /spot/:id path', () => {
    expect(parseRoute('/spot/tsunoshima')).toEqual({ type: 'spot', id: 'tsunoshima' })
  })

  it('returns spot with the id when the path has a trailing slash', () => {
    expect(parseRoute('/spot/tsunoshima/')).toEqual({ type: 'spot', id: 'tsunoshima' })
  })

  it('returns root when the spot id is missing', () => {
    expect(parseRoute('/spot/')).toEqual({ type: 'root' })
    expect(parseRoute('/spot')).toEqual({ type: 'root' })
  })

  it('returns root for an unrelated path', () => {
    expect(parseRoute('/foo/bar')).toEqual({ type: 'root' })
  })

  it('decodes a URL-encoded id', () => {
    expect(parseRoute('/spot/some%20place')).toEqual({ type: 'spot', id: 'some place' })
  })
})
