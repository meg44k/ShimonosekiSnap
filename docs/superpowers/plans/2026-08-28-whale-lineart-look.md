# クジラの2次元線画ルック Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** クジラの見た目を、3Dモデルの形と遊泳から毎フレーム生成される「手描きの2次元線画」に変える(ポストプロセスのエッジ検出方式)。

**Architecture:** クジラを法線+深度バッファに描く「法線プリパス」→ Sobelフィルタで輪郭と折り目を線化し、時間量子化ノイズで線を揺らし(boil)、暗いハローを付ける「エッジ検出パス」→ スパークル・水しぶきを重ねる「オーバーレイパス」の3段構成。`EffectComposer`は使わず、既存の手書き描画ループ内で管理する。3Dモデルは低ポリのものから CC-BY のザトウクジラ(整形済み glb 約286KB)へ差し替える。演出(海の出入り・弧の軌道・休止ループ)は変更しない。

**Tech Stack:** React + TypeScript + Vite、three@0.160.0(固定)、mind-ar@1.2.5(固定)、vitest(純ロジックのみ)、`@gltf-transform/cli`(モデル整形、npx経由・依存追加なし)

**Spec:** `docs/superpowers/specs/2026-08-28-whale-lineart-look-design.md`

## Global Constraints

- `three`は`0.160.0`に厳密固定する(`mind-ar@1.2.5`が参照する`sRGBEncoding`が`three@0.165.0`以降で削除されているため)。新しい three API を使う場合もこのバージョンで存在することを確認する
- `mind-ar`は`1.2.5`に固定する
- `mind-ar`にはTypeScript型定義がない。`mind-ar`からのインポートは`// @ts-expect-error`で無効化する既存の方針を踏襲する
- 新規テストは`vitest`を使うが、対象はDOM/WebGL/カメラに依存しない純粋ロジックのみ。エッジ検出パイプラインのGPU描画・AR表示・撮影はブラウザでの手動確認とする(既存方針)
- 既存のCSSクラス(`start-screen`, `location-list`等)を可能な限り再利用し、新規クラスは最小限に留める
- クジラの3Dモデルは CC-BY-4.0。クレジット文(下記)をコードのコメントだけでなくアプリ内のユーザーが確認できる場所に1箇所表示する。クレジット文言は改変しない:
  `This work is based on "Humpback Whale (Swimming)" (https://sketchfab.com/3d-models/humpback-whale-swimming-f4912be9163a4f45b2480df8ccb8b2c6) by Connlan_Immure (https://sketchfab.com/Connlan_Immure) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)`
- 現行モデル`whale.glb`は本計画では削除しない(新モデルの実機確認完了後に別タスクで削除)
- エッジ検出方式の品質・負荷が実機で許容できない場合は、設計書の代替案「シェーダー輪郭線(インバーテッドハル)+ 手描き内側ライン」へ退避する(本計画の範囲外)
- レンダーターゲットは`DepthTexture`を使うため WebGL2 前提。非対応環境では`onError`で通知する

---

### Task 1: ザトウクジラモデルの配置・整形スクリプト・検証テスト

整形済みの glb(`src/locations/tsunoshima/humpback-whale.glb`, 約286KB)は既に作業ツリーに配置済み(未コミット)。これをコミットし、再現用スクリプトと、コミットされた glb の中身を検証するテストを追加する。

**Files:**
- Add(commit existing untracked): `src/locations/tsunoshima/humpback-whale.glb`
- Create: `scripts/process-whale-model.mjs`
- Create: `src/locations/tsunoshima/humpbackModel.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `src/locations/tsunoshima/humpback-whale.glb`(Task 3 が `?url` インポートする)

- [ ] **Step 1: 生ダウンロードを誤ってコミットしないよう .gitignore に追記**

`.gitignore`の末尾に追記する:

```
# Raw Sketchfab downloads (only the processed .glb is committed)
src/assets/humpback_whale_swimming/
```

- [ ] **Step 2: 整形スクリプトを作成**

`scripts/process-whale-model.mjs`:

```javascript
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
```

- [ ] **Step 3: 検証テストを書く**

`src/locations/tsunoshima/humpbackModel.test.ts`:

```typescript
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
```

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `npx vitest run src/locations/tsunoshima/humpbackModel.test.ts`
Expected: PASS(4件)。FAILする場合は配置済みの glb が想定と違うので、`node scripts/process-whale-model.mjs`(生ダウンロードが必要)で作り直す

- [ ] **Step 5: 既存テストが壊れていないことを確認**

Run: `npm run test`
Expected: 既存の36件 + 新規4件 = 40件 PASS

- [ ] **Step 6: コミット**

```bash
git add .gitignore scripts/process-whale-model.mjs src/locations/tsunoshima/humpback-whale.glb src/locations/tsunoshima/humpbackModel.test.ts
git commit -m "feat: 線画用にザトウクジラモデル(CC-BY)を追加・整形"
```

---

### Task 2: lineArtRenderer の純粋ヘルパー(TDD)

エッジ検出パイプライン本体(GPU)の前に、テスト可能な純粋関数だけ先に作る。`lineArtRenderer.ts`をこの2関数で新規作成し、GPUクラスはTask 4で追記する。

**Files:**
- Create: `src/features/ar/lineArtRenderer.ts`
- Test: `src/features/ar/lineArtRenderer.test.ts`

**Interfaces:**
- Produces:
  - `export function quantizeTime(elapsedMs: number, hz: number): number` — 経過時間を`hz`回/秒の階段状に量子化した整数ステップ(boilシード用)
  - `export interface RenderTargetSize { width: number; height: number }`
  - `export function resolveRenderTargetSize(cssWidth: number, cssHeight: number, pixelRatio: number, options?: { maxPixelRatio?: number; scale?: number }): RenderTargetSize` — レンダーターゲットの画素サイズ。`pixelRatio`は`maxPixelRatio`(既定2)で頭打ち、`scale`(既定1)で全体を縮小、最低1px

- [ ] **Step 1: 失敗するテストを書く**

`src/features/ar/lineArtRenderer.test.ts`:

```typescript
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/features/ar/lineArtRenderer.test.ts`
Expected: FAIL(`lineArtRenderer.ts`が存在しない)

- [ ] **Step 3: 実装を書く**

`src/features/ar/lineArtRenderer.ts`:

```typescript
export function quantizeTime(elapsedMs: number, hz: number): number {
  return Math.floor((elapsedMs / 1000) * hz)
}

export interface RenderTargetSize {
  width: number
  height: number
}

export function resolveRenderTargetSize(
  cssWidth: number,
  cssHeight: number,
  pixelRatio: number,
  options: { maxPixelRatio?: number; scale?: number } = {},
): RenderTargetSize {
  const { maxPixelRatio = 2, scale = 1 } = options
  const ratio = Math.min(pixelRatio, maxPixelRatio) * scale
  return {
    width: Math.max(1, Math.round(cssWidth * ratio)),
    height: Math.max(1, Math.round(cssHeight * ratio)),
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/features/ar/lineArtRenderer.test.ts`
Expected: PASS(8件)

- [ ] **Step 5: コミット**

```bash
git add src/features/ar/lineArtRenderer.ts src/features/ar/lineArtRenderer.test.ts
git commit -m "feat: lineArtRendererの純粋ヘルパー(boil量子化・RT解像度)"
```

---

### Task 3: エフェクト契約に線画フラグを追加し、loadWhaleModel を新モデルへ差し替え

`LoadedEffectModel`に線画化対象を示すフラグを足し、`loadWhaleModel.ts`を新モデル用に書き換える。フレネルマテリアルと地面影は撤去する。

**Files:**
- Modify: `src/locations/types.ts`
- Modify: `src/locations/tsunoshima/loadWhaleModel.ts`(全体を置き換え)
- Delete: `src/locations/tsunoshima/glowMaterial.ts`
- Delete: `src/locations/tsunoshima/groundShadow.ts`

**Interfaces:**
- Consumes: `src/locations/tsunoshima/humpback-whale.glb`(Task 1)、`SEA_LEVEL_Y`(`./seaLevel`)、`createSparkleEmitter`(`./sparkleParticles`)、`createSplashEmitter`(`./splashParticles`)、`detectSplashCrossing`(`./splashTrigger`)、`getWhaleTransform`(`./whaleAnimation`)
- Produces: `LoadedEffectModel`に`lineArt?: boolean`を追加。`loadWhaleModel(): Promise<LoadedEffectModel>`が`lineArt: true`を含むオブジェクトを返す(Task 5 が参照)

- [ ] **Step 1: `LoadedEffectModel`にフラグを追加**

`src/locations/types.ts`の`LoadedEffectModel`インターフェースに1フィールド追加する。既存のJSDocコメントの末尾(`markerUpdate`の説明の後)に以下を追記し、インターフェース本体を差し替える:

```typescript
/**
 * ...(既存の説明はそのまま)...
 *
 * lineArtも省略可能。trueにすると、ArCameraViewはobjectのメッシュを
 * 専用レイヤーに隔離し、法線+深度バッファに描いてからエッジ検出で
 * 線画化する(通常のマテリアル描画は行わない)。objectに含まれる
 * Sprite(スパークル等)は線画化されず通常描画される。
 */
export interface LoadedEffectModel {
  object: THREE.Object3D
  update?: (deltaSeconds: number) => void
  clippingPlanes?: THREE.Plane[]
  markerObject?: THREE.Object3D
  markerUpdate?: (deltaSeconds: number, elapsedMs: number) => void
  lineArt?: boolean
}
```

- [ ] **Step 2: 型チェック**

Run: `npm run build`
Expected: エラーなく完了する(フラグ追加のみ、既存コードは影響なし)

- [ ] **Step 3: `loadWhaleModel.ts`を置き換える**

`src/locations/tsunoshima/loadWhaleModel.ts`の内容を以下に置き換える:

```typescript
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import type { LoadedEffectModel } from '../types'
import { SEA_LEVEL_Y } from './seaLevel'
import { createSparkleEmitter } from './sparkleParticles'
import { createSplashEmitter } from './splashParticles'
import { detectSplashCrossing } from './splashTrigger'
// humpback-whale.glb: processed from "Humpback Whale (Swimming)" by Connlan_Immure
// (https://sketchfab.com/3d-models/humpback-whale-swimming-f4912be9163a4f45b2480df8ccb8b2c6),
// CC-BY-4.0. Textures stripped; only geometry/skin/animation kept. See scripts/process-whale-model.mjs.
import whaleModelUrl from './humpback-whale.glb?url'

// このモデルは全長約27ユニット(POSITION の X 幅)。マーカー座標系での
// 全長がおおよそ tunoshima.jpg 横幅の 0.5〜0.7 倍になるよう初期見積もり。
// 実機の見た目(尻尾が橋に被らないか等)を見て Task 7 で調整する。
const WHALE_SCALE = 0.022
// このモデルはローカル -X が頭の向き。whaleAnimation.ts は +Z が頭前提の
// rotationY を返すので、-X を +Z に合わせる基準回転を入れる。符号(+/-90°)は
// 実機で頭が進行方向を向く方を Task 7 で確定する。
const WHALE_BASE_ROTATION_X = 0
const WHALE_BASE_ROTATION_Y = Math.PI / 2

// humpback-whale.glb に含まれる唯一の遊泳クリップ名
const SWIM_CLIP_NAME = 'Take 001'

const loader = new GLTFLoader()

export function loadWhaleModel(): Promise<LoadedEffectModel> {
  return new Promise((resolve, reject) => {
    loader.load(
      whaleModelUrl,
      (gltf) => {
        gltf.scene.scale.setScalar(WHALE_SCALE)
        gltf.scene.rotation.set(WHALE_BASE_ROTATION_X, WHALE_BASE_ROTATION_Y, 0)

        // エッジ検出は面の法線に Sobel をかけるので、ローポリの面ごとに
        // 分かれた法線だとカクカクの線が出る。頂点を統合してスムーズな
        // 法線を計算し直す。マテリアルは実際には ArCameraView 側の
        // MeshNormalMaterial オーバーライドでしか描かれないが、有効な
        // マテリアルは必要なのでフラットなものを残す。
        const flat = new THREE.MeshBasicMaterial({ color: 0x24495c })
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry = mergeVertices(child.geometry)
            child.geometry.computeVertexNormals()
            child.material = flat
          }
        })

        const group = new THREE.Group()
        group.add(gltf.scene)

        const mixer = new THREE.AnimationMixer(gltf.scene)
        const swimClip =
          gltf.animations.find((clip) => clip.name === SWIM_CLIP_NAME) ?? gltf.animations[0]
        if (swimClip) {
          mixer.clipAction(swimClip).play()
        }

        // クジラが見えている間、体の周りに光の粒が漂う。クジラと一緒に
        // 動いてよいのでクジラのローカルグループにそのまま追加する
        // (Sprite なので ArCameraView 側で線画化の対象外になる)。
        const sparkles = createSparkleEmitter()
        group.add(sparkles.object)

        // 水しぶきはクジラと一緒に動いてはいけない(発生した海面位置に
        // 留まる)ため、markerObject として別枠で公開しエフェクトグループの
        // 外(マーカー座標系直下)へ配置してもらう。
        const splash = createSplashEmitter()
        const markerGroup = new THREE.Group()
        markerGroup.add(splash.object)
        let prevElapsedMs = 0

        resolve({
          object: group,
          lineArt: true,
          update: (deltaSeconds) => {
            mixer.update(deltaSeconds)
            sparkles.update(deltaSeconds)
          },
          // 平面の法線が +Y、定数が -SEA_LEVEL_Y の場合、y > SEA_LEVEL_Y の
          // 部分が描画され、それより下(水中)は描画されない。
          clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, 1, 0), -SEA_LEVEL_Y)],
          markerObject: markerGroup,
          markerUpdate: (deltaSeconds, elapsedMs) => {
            const event = detectSplashCrossing(prevElapsedMs, elapsedMs)
            if (event) {
              splash.spawn(event.position)
            }
            prevElapsedMs = elapsedMs
            splash.update(deltaSeconds)
          },
        })
      },
      undefined,
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
    )
  })
}
```

- [ ] **Step 4: 不要になったファイルを削除**

```bash
git rm src/locations/tsunoshima/glowMaterial.ts src/locations/tsunoshima/groundShadow.ts
```

- [ ] **Step 5: 型チェックとテストを実行**

Run: `npm run build`
Expected: エラーなく完了する(`glowMaterial`/`groundShadow`への参照が残っていないこと。参照が残っていれば削除する)

Run: `npm run test`
Expected: 全テスト PASS(このタスクはロジックを変えないので件数は Task 2 完了時のまま)

- [ ] **Step 6: コミット**

```bash
git add src/locations/types.ts src/locations/tsunoshima/loadWhaleModel.ts
git commit -m "feat: loadWhaleModelを線画用の新モデルに差し替え(フレネル・地面影を撤去)"
```

---

### Task 4: エッジ検出パイプライン本体(GPU)を lineArtRenderer に追記

`lineArtRenderer.ts`に、法線プリパス用のレンダーターゲット・オーバーライドマテリアル・全画面エッジ検出シェーダをまとめた `createLineArtRenderer` を追記する。GPU描画のためユニットテストは構築のスモークテストのみ。

**Files:**
- Modify: `src/features/ar/lineArtRenderer.ts`
- Test: `src/features/ar/lineArtRenderer.test.ts`(スモークテストを追記)

**Interfaces:**
- Consumes: `quantizeTime`、`resolveRenderTargetSize`(Task 2、同ファイル)
- Produces:
  - `export const WHALE_LINEART_LAYER = 1`
  - `export interface LineArtRenderer { setSize(cssWidth: number, cssHeight: number, pixelRatio: number): void; setClippingPlanes(planes: THREE.Plane[] | null): void; renderLineArt(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, elapsedMs: number): void; dispose(): void }`
  - `export function createLineArtRenderer(): LineArtRenderer`

- [ ] **Step 1: スモークテストを追記**

`src/features/ar/lineArtRenderer.test.ts`の末尾に追記する:

```typescript
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/features/ar/lineArtRenderer.test.ts`
Expected: FAIL(`createLineArtRenderer`/`WHALE_LINEART_LAYER`が未定義)

- [ ] **Step 3: パイプライン本体を実装**

`src/features/ar/lineArtRenderer.ts`の末尾(既存のヘルパーの下)に追記する:

```typescript
import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

export const WHALE_LINEART_LAYER = 1

// --- チューニング用パラメータ(実機で調整。Task 7) ---
const BOIL_HZ = 8 // 線のゆらぎの更新頻度(回/秒)
const BOIL_AMP = 1.6 // ゆらぎの振幅(テクセル)
const DEPTH_THRESHOLD = 0.18 // 深度エッジのしきい値(ビュー空間の距離)
const NORMAL_THRESHOLD = 0.45 // 法線エッジのしきい値(法線ベクトル勾配の長さ)
const HALO_RADIUS = 2.5 // ハローの膨張半径(テクセル)
const HALO_ALPHA = 0.5 // ハローの不透明度
const LINE_COLOR = new THREE.Color('#eaf6ff') // 線の色(ほぼ白)
const HALO_COLOR = new THREE.Color('#0a1a2a') // ハローの色(暗い紺)
const RT_SCALE = 1 // 1 未満にするとエッジパスを低解像度化して負荷を下げる

const EDGE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const EDGE_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tNormal;
  uniform sampler2D tDepth;
  uniform vec2 uResolution;
  uniform float uNear;
  uniform float uFar;
  uniform float uStep;
  uniform vec3 uLineColor;
  uniform vec3 uHaloColor;
  uniform float uHaloAlpha;
  uniform float uHaloRadius;
  uniform float uDepthThreshold;
  uniform float uNormalThreshold;
  uniform float uBoilAmp;

  // 非線形の遠近深度(0..1)を線形のビューZ(負値)に変換する
  float linearizeDepth(float d) {
    return (uNear * uFar) / ((uFar - uNear) * d - uFar);
  }

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec2 texel = 1.0 / uResolution;

    // boil: 数コマに1回だけ変わる、カーネル全体で共通のオフセット
    vec2 boil = (vec2(
      hash12(vUv * 37.0 + uStep),
      hash12(vUv * 37.0 + uStep + 19.7)
    ) - 0.5) * uBoilAmp * texel;
    vec2 uv = vUv + boil;

    float d[9];
    vec3 n[9];
    int k = 0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y)) * texel;
        d[k] = linearizeDepth(texture2D(tDepth, uv + o).r);
        n[k] = texture2D(tNormal, uv + o).rgb * 2.0 - 1.0;
        k++;
      }
    }

    float gxD = d[0] + 2.0 * d[3] + d[6] - d[2] - 2.0 * d[5] - d[8];
    float gyD = d[0] + 2.0 * d[1] + d[2] - d[6] - 2.0 * d[7] - d[8];
    float depthEdge = length(vec2(gxD, gyD));

    vec3 gxN = n[0] + 2.0 * n[3] + n[6] - n[2] - 2.0 * n[5] - n[8];
    vec3 gyN = n[0] + 2.0 * n[1] + n[2] - n[6] - 2.0 * n[7] - n[8];
    float normalEdge = max(length(gxN), length(gyN));

    float eDepth = smoothstep(uDepthThreshold, uDepthThreshold * 2.0, depthEdge);
    float eNormal = smoothstep(uNormalThreshold, uNormalThreshold * 2.0, normalEdge);
    float lineCore = max(eDepth, eNormal);

    // ハロー: シルエット(中心との深度差)を広い半径で拾って膨張させる
    float halo = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) / 8.0 * 6.2831853;
      vec2 o = vec2(cos(a), sin(a)) * texel * uHaloRadius;
      float dd = linearizeDepth(texture2D(tDepth, uv + o).r);
      halo = max(halo, step(uDepthThreshold, abs(dd - d[4])));
    }
    halo = max(halo, lineCore);

    vec3 rgb = mix(uHaloColor, uLineColor, lineCore);
    float alpha = clamp(max(lineCore, halo * uHaloAlpha), 0.0, 1.0);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(rgb, alpha);
  }
`

export interface LineArtRenderer {
  setSize(cssWidth: number, cssHeight: number, pixelRatio: number): void
  setClippingPlanes(planes: THREE.Plane[] | null): void
  renderLineArt(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    elapsedMs: number,
  ): void
  dispose(): void
}

export function createLineArtRenderer(): LineArtRenderer {
  const normalTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: true,
    depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  })

  const normalMaterial = new THREE.MeshNormalMaterial()
  // MeshNormalMaterial は SkinnedMesh に対して自動でスキニングされる(three r160)。
  // 遊泳変形は法線バッファに反映される。
  normalMaterial.clipping = true

  const uniforms = {
    tNormal: { value: normalTarget.texture },
    tDepth: { value: normalTarget.depthTexture },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.01 },
    uFar: { value: 1000 },
    uStep: { value: 0 },
    uLineColor: { value: LINE_COLOR },
    uHaloColor: { value: HALO_COLOR },
    uHaloAlpha: { value: HALO_ALPHA },
    uHaloRadius: { value: HALO_RADIUS },
    uDepthThreshold: { value: DEPTH_THRESHOLD },
    uNormalThreshold: { value: NORMAL_THRESHOLD },
    uBoilAmp: { value: BOIL_AMP },
  }

  const edgeMaterial = new THREE.ShaderMaterial({
    vertexShader: EDGE_VERT,
    fragmentShader: EDGE_FRAG,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const fsQuad = new FullScreenQuad(edgeMaterial)

  return {
    // internals exposed for tests only
    _normalTarget: normalTarget,

    setSize(cssWidth, cssHeight, pixelRatio) {
      const { width, height } = resolveRenderTargetSize(cssWidth, cssHeight, pixelRatio, {
        maxPixelRatio: 2,
        scale: RT_SCALE,
      })
      normalTarget.setSize(width, height)
      normalTarget.depthTexture.image.width = width
      normalTarget.depthTexture.image.height = height
      uniforms.uResolution.value.set(width, height)
    },

    setClippingPlanes(planes) {
      normalMaterial.clippingPlanes = planes
    },

    renderLineArt(renderer, scene, camera, elapsedMs) {
      const savedMask = camera.layers.mask
      const savedTarget = renderer.getRenderTarget()

      // --- 法線プリパス ---
      renderer.setRenderTarget(normalTarget)
      renderer.setClearColor(0x000000, 0)
      renderer.clear(true, true, false)
      scene.overrideMaterial = normalMaterial
      camera.layers.set(WHALE_LINEART_LAYER)
      renderer.render(scene, camera)
      scene.overrideMaterial = null
      camera.layers.mask = savedMask
      renderer.setRenderTarget(savedTarget)

      // --- エッジ検出パス(現在バインドされている描画先へ) ---
      uniforms.uNear.value = camera.near
      uniforms.uFar.value = camera.far
      uniforms.uStep.value = quantizeTime(elapsedMs, BOIL_HZ)
      fsQuad.render(renderer)
    },

    dispose() {
      normalTarget.dispose()
      normalTarget.depthTexture.dispose()
      normalMaterial.dispose()
      edgeMaterial.dispose()
      fsQuad.dispose()
    },
  } as LineArtRenderer & { _normalTarget: THREE.WebGLRenderTarget }
}
```

補足: 既存ヘルパーとこの追記で`import * as THREE`が二重にならないよう、ファイル先頭の`import`にまとめること(`quantizeTime`/`resolveRenderTargetSize`だけの状態では three を import していないので、先頭に `import * as THREE from 'three'` と `import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'` を追加する)。

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/features/ar/lineArtRenderer.test.ts`
Expected: PASS(ヘルパー8件 + スモーク3件 = 11件)

- [ ] **Step 5: 型チェック**

Run: `npm run build`
Expected: エラーなく完了する

- [ ] **Step 6: コミット**

```bash
git add src/features/ar/lineArtRenderer.ts src/features/ar/lineArtRenderer.test.ts
git commit -m "feat: エッジ検出+boil+ハローの線画パイプラインを追加"
```

---

### Task 5: ArCameraView の描画ループを3段構成に組み替え

`ArCameraView.tsx`にエッジ検出パイプラインを配線する。描画ループを「法線プリパス → エッジ検出 → オーバーレイ」に組み替え、クジラを専用レイヤーへ隔離し、WebGL2チェックとリサイズ・破棄処理を足す。地面影のための`shadowMap`設定を削除する。

**Files:**
- Modify: `src/features/ar/ArCameraView.tsx`

**Interfaces:**
- Consumes: `createLineArtRenderer`、`WHALE_LINEART_LAYER`、`LineArtRenderer`(Task 4)、`LoadedEffectModel.lineArt`(Task 3)

- [ ] **Step 1: import と ref を追加**

`src/features/ar/ArCameraView.tsx`の import 群に追加:

```typescript
import { createLineArtRenderer, WHALE_LINEART_LAYER, type LineArtRenderer } from './lineArtRenderer'
```

`useEffect`内、`mindarThree`生成の直後あたりに宣言を追加(既存の`let markerObject`等と並べる):

```typescript
let lineArt: LineArtRenderer | null = null
```

- [ ] **Step 2: WebGL2 チェックと shadowMap 設定の削除**

`const { renderer, scene, camera } = mindarThree` の直後のブロックを、次のように置き換える:

置き換え前:
```typescript
    renderer.localClippingEnabled = true
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
```

置き換え後:
```typescript
    renderer.localClippingEnabled = true
    renderer.autoClear = false

    if (!renderer.capabilities.isWebGL2) {
      onError('お使いのブラウザはこのエフェクトに対応していません(WebGL2が必要です)')
      return () => {
        mindarRef.current = null
      }
    }
```

- [ ] **Step 3: モデルロード時に線画レイヤーとパイプラインを設定**

`location.effect.loadModel().then((model) => { ... })` の中、`effectGroup.add(model.object)` の直後に追加する:

```typescript
        if (model.lineArt) {
          model.object.traverse((child) => {
            // Sprite(スパークル)は線画化しない。Mesh/SkinnedMesh だけ隔離する。
            if (child instanceof THREE.Mesh) {
              child.layers.set(WHALE_LINEART_LAYER)
            }
          })
          lineArt = createLineArtRenderer()
          const container = containerRef.current
          if (container) {
            lineArt.setSize(container.clientWidth, container.clientHeight, window.devicePixelRatio)
          }
        }
```

同じ`then`内、`clippingPlanes`を各メッシュに適用しているブロックの直後に、オーバーライドマテリアルにも同じ配列参照を渡す1行を追加する:

```typescript
        // 既存: worldClippingPlanes を model.object の各メッシュ材質に設定した後
        lineArt?.setClippingPlanes(worldClippingPlanes.length > 0 ? worldClippingPlanes : null)
```

- [ ] **Step 4: 描画ループを組み替え**

`renderer.setAnimationLoop(() => { ... })` の中身のうち、`renderer.render(scene, camera)` を含む部分を置き換える。

置き換え前(該当箇所):
```typescript
          if (targetVisible) {
            modelMarkerUpdate?.(deltaSeconds, now - startedAt)
          }
          renderer.render(scene, camera)
```

置き換え後:
```typescript
          if (targetVisible) {
            modelMarkerUpdate?.(deltaSeconds, now - startedAt)
          }

          // 画面を1回だけクリア(autoClear=false のため手動)
          renderer.setRenderTarget(null)
          renderer.setClearColor(0x000000, 0)
          renderer.clear(true, true, true)

          if (lineArt) {
            // 法線プリパス → エッジ検出パス(線画のクジラを画面へ)
            lineArt.renderLineArt(renderer, scene, camera, now - startedAt)
            // オーバーレイ: レイヤー0(スパークル・水しぶき)を上に重ねる
            renderer.clearDepth()
            camera.layers.set(0)
            renderer.render(scene, camera)
            camera.layers.set(0)
          } else {
            renderer.render(scene, camera)
          }
```

- [ ] **Step 5: リサイズ対応**

`useEffect`内、`mindarThree.start().then(...)` の成功ブロックで `setReady(true)` の直後に、リサイズ購読を追加する:

```typescript
        const handleResize = () => {
          const container = containerRef.current
          if (container && lineArt) {
            lineArt.setSize(container.clientWidth, container.clientHeight, window.devicePixelRatio)
          }
        }
        window.addEventListener('resize', handleResize)
        resizeCleanup = () => window.removeEventListener('resize', handleResize)
```

その `let resizeCleanup: (() => void) | null = null` を`useEffect`冒頭の他の`let`宣言群に追加する。

- [ ] **Step 6: クリーンアップで破棄**

`useEffect`の`return () => { ... }` の中、`mindarRef.current = null` の直前に追加する:

```typescript
      resizeCleanup?.()
      lineArt?.dispose()
```

- [ ] **Step 7: 型チェックと既存テスト**

Run: `npm run build`
Expected: エラーなく完了する

Run: `npm run test`
Expected: 全テスト PASS(このタスクではロジックのテストは増減しない)

- [ ] **Step 8: コミット**

```bash
git add src/features/ar/ArCameraView.tsx
git commit -m "feat: ArCameraViewの描画ループを線画3段構成に組み替え"
```

---

### Task 6: CC-BY クレジットをアプリ内に表示

モデルの帰属表示を案内画面のフッターに追加する。

**Files:**
- Modify: `src/pages/GuidancePage.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: なし(静的な文言)

- [ ] **Step 1: `GuidancePage.tsx`にフッターを追加**

`src/pages/GuidancePage.tsx`を次のように置き換える:

```tsx
import { listLocations } from '../locations'

// モデルの帰属表示(CC-BY-4.0、文言は改変不可)
const MODEL_CREDIT =
  'This work is based on "Humpback Whale (Swimming)" (https://sketchfab.com/3d-models/humpback-whale-swimming-f4912be9163a4f45b2480df8ccb8b2c6) by Connlan_Immure (https://sketchfab.com/Connlan_Immure) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)'

export function GuidancePage() {
  const locations = listLocations()

  return (
    <div className="start-screen">
      <div className="camera-icon">📱</div>
      <p>QRコードを読み取ってください</p>
      {locations.length > 0 && (
        <div className="location-list">
          <p className="location-list-label">動作確認用リンク</p>
          <ul>
            {locations.map((location) => (
              <li key={location.id}>
                <a href={`/spot/${encodeURIComponent(location.id)}`}>{location.name}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="model-credit">{MODEL_CREDIT}</p>
    </div>
  )
}
```

- [ ] **Step 2: スタイルを追加**

`src/App.css`の末尾に追加する:

```css
.model-credit {
  margin-top: 24px;
  max-width: 480px;
  font-size: 10px;
  line-height: 1.5;
  color: rgba(0, 0, 0, 0.45);
  word-break: break-all;
  text-align: center;
}
```

- [ ] **Step 3: 型チェックと表示確認**

Run: `npm run build`
Expected: エラーなく完了する

Run: `npm run dev` して `/` を開く
Expected: 案内画面の下部に小さくクレジット文が表示される

- [ ] **Step 4: コミット**

```bash
git add src/pages/GuidancePage.tsx src/App.css
git commit -m "feat: クジラモデルのCC-BYクレジットを案内画面に表示"
```

---

### Task 7: 実機での動作確認とパラメータ調整

コードは揃ったので、実機(スマートフォン)でAR動作を確認し、`lineArtRenderer.ts`と`loadWhaleModel.ts`の見積もり値を実際の見た目に合わせて調整する。

**Files:**
- Modify: `src/features/ar/lineArtRenderer.ts`(チューニング用定数)
- Modify: `src/locations/tsunoshima/loadWhaleModel.ts`(`WHALE_SCALE` / `WHALE_BASE_ROTATION_Y`)

**Interfaces:**
- Consumes: なし

- [ ] **Step 1: アプリを起動して `/spot/tsunoshima` にアクセス**

1. `docker compose up -d`(または `npm run dev`)でアプリを起動
2. スマートフォン実機のブラウザで `/spot/tsunoshima` を開く
3. カメラ権限を許可

- [ ] **Step 2: 別モニターで `tunoshima.jpg` を表示し、カメラを向けて以下を確認**

- [ ] WebGL2 非対応エラーが出ない(出た場合はそのブラウザでは動かない。別ブラウザで確認)
- [ ] 画像を認識するとクジラが海から出て橋上空を弧を描き、また海に潜る(=`effectGroup`の位置設定でベジェ軌道を追従できている。SkinnedMesh非ルート警告が実害になっていない。もし全く動かない/位置がおかしい場合は、後述のフォールバック)
- [ ] クジラが「塗り」ではなく線画で描かれている。輪郭に加えて喉のすじ・口・ヒレの付け根・尾に内側の線が出ている
- [ ] 線が数コマに1回フルッと揺れる(boil)
- [ ] 明るい橋の写真の上でも線が埋もれず、線のまわりに暗いフチ(ハロー)が見える
- [ ] 頭が常に進行方向を向いている(向いていなければ Step 4 で回転を修正)
- [ ] クジラが海面と接する所に水しぶきが出る
- [ ] クジラの周りに光の粒(スパークル)が漂う
- [ ] シャッターを押すと、線画のクジラが写り込んだ写真がプレビューされる
- [ ] 体感の描画負荷(カクつき)が許容範囲

- [ ] **Step 3: 線の見た目を `lineArtRenderer.ts` の定数で調整**

見た目に応じて調整する:
- 線が出すぎる/ノイズっぽい → `DEPTH_THRESHOLD` / `NORMAL_THRESHOLD` を上げる
- 線が細すぎる/切れる → しきい値を下げる、または `BOIL_AMP` を下げる
- boilが激しすぎる/気になる → `BOIL_AMP` を下げる、`BOIL_HZ` を下げる
- 明るい背景で線が見えにくい → `HALO_ALPHA` / `HALO_RADIUS` を上げる、`HALO_COLOR` をより暗く
- 描画が重い → `RT_SCALE` を `0.75` に下げる

- [ ] **Step 4: クジラの大きさ・向きを `loadWhaleModel.ts` で調整**

- 尻尾が橋に被る/大きすぎる → `WHALE_SCALE` を下げる
- 小さくて雄大さがない → `WHALE_SCALE` を上げる(被り具合とのトレードオフ)
- 頭が進行方向と逆/横を向く → `WHALE_BASE_ROTATION_Y` を `-Math.PI / 2` にする、または `Math.PI` 足し引きする

- [ ] **Step 5: (フォールバック)クジラが軌道を追従しない場合**

`loadWhaleModel.ts`の`then`ハンドラで、`gltf.scene`内の`SkinnedMesh`を探し、そのスケルトンのルートボーン(`skeleton.bones[0]`)と`SkinnedMesh`自身を`group`直下に`attach`し直す(ワールド変形を保ったまま再ペアレント)。具体的には`gltf.scene.traverse`で`child instanceof THREE.SkinnedMesh`を見つけ、`group.attach(child)`し、`skeleton.bones`のルートも`group.attach`する。これで`group`(=`model.object`、`effectGroup`の子)の transform がスキンドメッシュに効くようになる。

- [ ] **Step 6: 調整した値をコミット**

```bash
git add src/features/ar/lineArtRenderer.ts src/locations/tsunoshima/loadWhaleModel.ts
git commit -m "fix: 実機の見た目に合わせて線画パラメータ・クジラのスケール/向きを調整"
```

---

## Self-Review

**Spec coverage:**

| Spec のセクション/要件 | 対応タスク |
| --- | --- |
| 質感B / 演出A維持 / ハローA / boil / 輪郭+内側の線 | Task 4(シェーダ)、Task 5(パイプライン配線)、`whaleAnimation.ts`は不変 |
| 実現方式=ポストプロセスのエッジ検出 | Task 4、Task 5 |
| モデル差し替え(Connlan_Immure、CC-BY、整形) | Task 1、Task 3 |
| モデル整形(テクスチャ削除、prune、resample、検証) | Task 1(スクリプト + 検証テスト) |
| 帰属表示(コメント + アプリ内1箇所) | Task 3(コメント)、Task 6(アプリ内) |
| レンダリングパイプライン(レイヤー分け、法線プリパス、エッジ検出、オーバーレイ) | Task 5 |
| 新規 `lineArtRenderer.ts` | Task 2(純ヘルパー)、Task 4(GPU本体) |
| 新規 `scripts/process-whale-model.mjs` | Task 1 |
| `ArCameraView.tsx`(レイヤー、ループ組み替え、shadowMap削除、WebGL2チェック) | Task 5 |
| `loadWhaleModel.ts`(新モデル、glow撤去、mergeVertices維持、回転・スケール、shadow撤去、splash/sparkle/clipping維持) | Task 3 |
| `types.ts` に `lineArt` フラグ | Task 3 |
| `glowMaterial.ts` / `groundShadow.ts` 削除 | Task 3 |
| 変更しない: `whaleAnimation.ts`・そのテスト・`splashTrigger`・`splashParticles`・`sparkleParticles`・`seaLevel`・`captureComposite`・`whale.glb` | どのタスクも触らない |
| リスク: SkinnedMesh非ルート | Task 7 Step 2/5(確認 + フォールバック手順) |
| リスク: モバイル fill-rate | Task 4(`RT_SCALE`定数)、Task 7 Step 3 |
| リスク: WebGL2/DepthTexture | Task 5 Step 2 |
| リスク: `MeshNormalMaterial`のスキニング | Task 4(コメント)、Task 7 Step 2 で確認 |
| リスク: アニメのループ継ぎ目 | Task 7 Step 2(確認項目) |
| スコープ外: 環境演出、演出変更、他場所への適用、`whale.glb`即時削除 | 計画に含めない(Global Constraints に明記) |

**Placeholder scan:** 各タスクにコード全文・実行コマンド・期待結果を記載。「適切なエラー処理」等の曖昧語なし。Task 7 は本質的に手動確認タスクのため、確認項目と調整方向を具体的に列挙している。

**Type consistency:**
- `LineArtRenderer` インターフェースのメソッド名(`setSize` / `setClippingPlanes` / `renderLineArt` / `dispose`)は Task 4 の定義と Task 5 の呼び出しで一致
- `createLineArtRenderer()` は引数なし(Task 4 定義、Task 5 呼び出し一致)
- `WHALE_LINEART_LAYER` は Task 4 で `export const = 1`、Task 5 で import 一致
- `LoadedEffectModel.lineArt?: boolean` は Task 3 で定義、Task 5 で `model.lineArt` 参照一致
- `renderLineArt(renderer, scene, camera, elapsedMs)` の引数順は Task 4 定義と Task 5 呼び出し(`now - startedAt` を `elapsedMs` に)で一致
- `resolveRenderTargetSize` / `quantizeTime` のシグネチャは Task 2 定義と Task 4 使用で一致
- `SWIM_CLIP_NAME` は Task 3 で `'Take 001'`(Task 1 の検証テストが確認する glb のクリップ名と一致)
