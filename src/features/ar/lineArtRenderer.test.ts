import { describe, expect, it } from 'vitest'
import { quantizeTime, resolveRenderTargetSize } from './lineArtRenderer'

describe('quantizeTime', () => {
  it('returns 0 at the start of the first step', () => {
    expect(quantizeTime(0, 8)).toBe(0)
  })

  it('stays on the same step within one interval (8hz -> 125ms per step)', () => {
    expect(quantizeTime(120, 8)).toBe(0)
  })

  it('advances to the next step once the interval is crossed', () => {
    expect(quantizeTime(130, 8)).toBe(1)
  })

  it('advances one step per second at 8hz after 1s', () => {
    expect(quantizeTime(1000, 8)).toBe(8)
  })
})

describe('resolveRenderTargetSize', () => {
  it('clamps the pixel ratio to maxPixelRatio (default 2)', () => {
    expect(resolveRenderTargetSize(390, 844, 3)).toEqual({ width: 780, height: 1688 })
  })

  it('passes a pixel ratio below the cap straight through', () => {
    expect(resolveRenderTargetSize(390, 844, 1)).toEqual({ width: 390, height: 844 })
  })

  it('applies the scale factor (0.75 downscale for fill-rate)', () => {
    expect(resolveRenderTargetSize(400, 300, 2, { scale: 0.75 })).toEqual({ width: 600, height: 450 })
  })

  it('never returns a dimension below 1px', () => {
    expect(resolveRenderTargetSize(0, 0, 2)).toEqual({ width: 1, height: 1 })
  })
})

import * as THREE from 'three'
import { createLineArtRenderer, WHALE_LINEART_LAYER } from './lineArtRenderer'

describe('createLineArtRenderer', () => {
  it('exposes the pipeline API and layer constant', () => {
    const lineArt = createLineArtRenderer()
    expect(WHALE_LINEART_LAYER).toBe(1)
    expect(typeof lineArt.setSize).toBe('function')
    expect(typeof lineArt.setClippingPlanes).toBe('function')
    expect(typeof lineArt.renderLineArt).toBe('function')
    expect(typeof lineArt.dispose).toBe('function')
    lineArt.dispose()
  })

  it('resizes the internal render target (clamped to 2x pixel ratio)', () => {
    const lineArt = createLineArtRenderer()
    lineArt.setSize(390, 844, 3)
    // @ts-expect-error reaching into internals for the test
    const rt = lineArt._normalTarget as THREE.WebGLRenderTarget
    expect(rt.width).toBe(780)
    expect(rt.height).toBe(1688)
    lineArt.dispose()
  })

  it('accepts a clipping planes array and clears it with null', () => {
    const lineArt = createLineArtRenderer()
    const planes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.07)]
    expect(() => lineArt.setClippingPlanes(planes)).not.toThrow()
    expect(() => lineArt.setClippingPlanes(null)).not.toThrow()
    lineArt.dispose()
  })
})
