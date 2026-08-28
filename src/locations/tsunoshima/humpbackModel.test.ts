import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Parse the JSON chunk of a .glb (binary glTF) without any 3D library.
function readGlbJson(path: string): any {
  const buf = readFileSync(path)
  expect(buf.readUInt32LE(0)).toBe(0x46546c67) // "glTF" magic
  const jsonChunkLength = buf.readUInt32LE(12)
  return JSON.parse(buf.subarray(20, 20 + jsonChunkLength).toString('utf8'))
}

describe('humpback-whale.glb', () => {
  const gltf = readGlbJson('src/locations/tsunoshima/humpback-whale.glb')

  it('has no embedded textures or images (line-art only needs geometry normals)', () => {
    expect(gltf.images ?? []).toHaveLength(0)
    expect(gltf.textures ?? []).toHaveLength(0)
  })

  it('has a single mesh with exactly the attributes the normal pass needs', () => {
    expect(gltf.meshes).toHaveLength(1)
    const attrs = Object.keys(gltf.meshes[0].primitives[0].attributes).sort()
    expect(attrs).toEqual(['JOINTS_0', 'NORMAL', 'POSITION', 'WEIGHTS_0'])
  })

  it('keeps the original triangle budget', () => {
    const prim = gltf.meshes[0].primitives[0]
    const indexCount = gltf.accessors[prim.indices].count
    expect(indexCount / 3).toBe(6592)
  })

  it('keeps the skin (15 joints) and the swim animation', () => {
    expect(gltf.skins).toHaveLength(1)
    expect(gltf.skins[0].joints).toHaveLength(15)
    expect(gltf.animations).toHaveLength(1)
    expect(gltf.animations[0].name).toBe('Take 001')
  })
})
