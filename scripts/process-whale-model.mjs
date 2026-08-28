// Regenerates src/locations/tsunoshima/humpback-whale.glb from the raw
// Sketchfab download.
//
// Prerequisite: download "Humpback Whale (Swimming)" by Connlan_Immure
// (https://sketchfab.com/3d-models/humpback-whale-swimming-f4912be9163a4f45b2480df8ccb8b2c6),
// CC-BY-4.0, "Download 3D Model" -> glTF, and extract it to
//   src/assets/humpback_whale_swimming/   (scene.gltf + scene.bin + textures/)
//
// Usage: node scripts/process-whale-model.mjs
//
// Attribution:
// This work is based on "Humpback Whale (Swimming)"
// (https://sketchfab.com/3d-models/humpback-whale-swimming-f4912be9163a4f45b2480df8ccb8b2c6)
// by Connlan_Immure (https://sketchfab.com/Connlan_Immure)
// licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)
//
// Steps:
//   1. Strip all texture/image data + unused vertex attributes from the glTF
//      JSON (the line-art pass only needs the mesh's own NORMAL attribute).
//   2. gltf-transform prune   (drop orphan nodes/accessors)
//   3. gltf-transform resample (lossless keyframe de-duplication)
//   4. gltf-transform validate (expect 0 errors)

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SRC_DIR = 'src/assets/humpback_whale_swimming'
const OUT = 'src/locations/tsunoshima/humpback-whale.glb'

const gltf = JSON.parse(readFileSync(join(SRC_DIR, 'scene.gltf'), 'utf8'))

delete gltf.images
delete gltf.textures
delete gltf.samplers // texture samplers (animation samplers live under animations[].samplers)
for (const material of gltf.materials ?? []) {
  const pbr = (material.pbrMetallicRoughness ??= {})
  delete pbr.baseColorTexture
  delete pbr.metallicRoughnessTexture
  delete material.normalTexture
  delete material.occlusionTexture
  delete material.emissiveTexture
  delete material.emissiveFactor
  pbr.baseColorFactor = [0.15, 0.29, 0.36, 1]
  pbr.metallicFactor = 0
  pbr.roughnessFactor = 1
  material.name = 'whale_flat'
}
for (const mesh of gltf.meshes) {
  for (const prim of mesh.primitives) {
    for (const key of ['TEXCOORD_0', 'TEXCOORD_1', 'TEXCOORD_2', 'TANGENT', 'COLOR_0']) {
      delete prim.attributes[key]
    }
  }
}

const work = mkdtempSync(join(tmpdir(), 'whale-'))
writeFileSync(join(work, 'scene.stripped.gltf'), JSON.stringify(gltf))
copyFileSync(join(SRC_DIR, 'scene.bin'), join(work, 'scene.bin'))

const cli = ['--yes', '@gltf-transform/cli@4']
const run = (args) => execFileSync('npx', [...cli, ...args], { stdio: 'inherit' })

run(['prune', join(work, 'scene.stripped.gltf'), join(work, 'pruned.glb')])
run(['resample', join(work, 'pruned.glb'), OUT])
run(['validate', OUT])

console.log(`\nWrote ${OUT}`)
