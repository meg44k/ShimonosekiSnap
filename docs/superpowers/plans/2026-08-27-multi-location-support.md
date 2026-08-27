# 複数場所対応(フレームワーク) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 場所ごとに固有のURL(`/spot/:id`)を持ち、QRコード経由でその場所専用のARカメラ画面が自動起動する仕組みを作る。既存の「角島大橋+クジラ」実装をこの仕組みの1つ目の場所として移行する。

**Architecture:** `window.location.pathname`を解析する自前の軽量ルーター、場所ごとの設定(`LocationConfig`: ターゲット画像パス・案内文・エフェクト)を保持する静的レジストリ、そしてクジラ専用だった`ArCameraView`を`LocationConfig`propベースに一般化する。既存のクジラ関連ロジック(`whaleAnimation.ts`/`loadWhaleModel.ts`)は中身を変更せず`src/locations/tsunoshima/`に移動するのみ。

**Tech Stack:** 既存(React + TypeScript + Vite + vitest)。新規ライブラリの追加なし(ルーティングは自前実装)。

**Spec:** `docs/superpowers/specs/2026-08-27-multi-location-support-design.md`

## Global Constraints

- ルーティングは自前のパス解析のみ実装する。`react-router-dom`等の新規ライブラリは追加しない
- 場所のURLは`/spot/:id`形式とする
- 既存の`whaleAnimation.ts`/`loadWhaleModel.ts`のロジックは変更しない。`src/locations/tsunoshima/`への移動と、`WhaleTransform`型を共通の`ArTransform`型に置き換える程度の変更のみ行う
- QRコード画像自体の生成は対象外
- 角島大橋以外の新しい場所のコンテンツ追加は対象外。今回作るのは複数場所に対応できる仕組みのみ

---

### Task 1: ルーター(パス解析、TDD)

`/spot/:id`形式のURLを解析する純粋関数を作る。ページ読み込み時に一度だけ呼び出す想定で、アプリ内でのクライアントサイド遷移(popstate監視等)は行わない(場所間の遷移はQRコード経由の新規ページ読み込みが前提のため)。

**Files:**
- Create: `src/router.ts`
- Test: `src/router.test.ts`

**Interfaces:**
- Produces: `export type Route = { type: 'root' } | { type: 'spot'; id: string }`、`export function parseRoute(pathname: string): Route`

- [ ] **Step 1: 失敗するテストを書く**

`src/router.test.ts`:

```typescript
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/router.test.ts`
Expected: FAIL(`router.ts`が存在しない)

- [ ] **Step 3: 実装を書く**

`src/router.ts`:

```typescript
export type Route = { type: 'root' } | { type: 'spot'; id: string }

const SPOT_PATH_PATTERN = /^\/spot\/([^/]+)\/?$/

export function parseRoute(pathname: string): Route {
  const match = pathname.match(SPOT_PATH_PATTERN)
  if (match) {
    return { type: 'spot', id: decodeURIComponent(match[1]) }
  }
  return { type: 'root' }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/router.test.ts`
Expected: PASS(6件すべて成功)

- [ ] **Step 5: コミット**

```bash
git add src/router.ts src/router.test.ts
git commit -m "feat: /spot/:id 形式のURLを解析するルーターを追加"
```

---

### Task 2: 場所の型定義と、既存クジラ実装の移行

既存の`src/features/ar/whaleAnimation.ts`・`loadWhaleModel.ts`・`whale.glb`を`src/locations/tsunoshima/`に移動し、共通の`LocationConfig`として組み立てる。ロジックの中身は変更しない。

**Files:**
- Create: `src/locations/types.ts`
- Move: `src/features/ar/whaleAnimation.ts` → `src/locations/tsunoshima/whaleAnimation.ts`
- Move: `src/features/ar/whaleAnimation.test.ts` → `src/locations/tsunoshima/whaleAnimation.test.ts`
- Move: `src/features/ar/loadWhaleModel.ts` → `src/locations/tsunoshima/loadWhaleModel.ts`
- Move: `src/assets/models/whale.glb` → `src/locations/tsunoshima/whale.glb`
- Create: `src/locations/tsunoshima/index.ts`

**Interfaces:**
- Produces:
  - `export interface ArTransform { position: [number, number, number]; rotationY: number; visible: boolean }`
  - `export interface ArEffect { loadModel(): Promise<THREE.Object3D>; getTransform(elapsedMs: number): ArTransform }`
  - `export interface LocationConfig { id: string; name: string; guidanceText: string; targetSrc: string; effect: ArEffect }`
  - `export const tsunoshimaLocation: LocationConfig`(`src/locations/tsunoshima/index.ts`)

- [ ] **Step 1: 型定義を作成**

`src/locations/types.ts`:

```typescript
import type * as THREE from 'three'

export interface ArTransform {
  position: [number, number, number]
  rotationY: number
  visible: boolean
}

export interface ArEffect {
  loadModel(): Promise<THREE.Object3D>
  getTransform(elapsedMs: number): ArTransform
}

export interface LocationConfig {
  id: string
  name: string
  guidanceText: string
  targetSrc: string
  effect: ArEffect
}
```

- [ ] **Step 2: 既存ファイルを移動する**

```bash
mkdir -p src/locations/tsunoshima
git mv src/features/ar/whaleAnimation.ts src/locations/tsunoshima/whaleAnimation.ts
git mv src/features/ar/whaleAnimation.test.ts src/locations/tsunoshima/whaleAnimation.test.ts
git mv src/features/ar/loadWhaleModel.ts src/locations/tsunoshima/loadWhaleModel.ts
git mv src/assets/models/whale.glb src/locations/tsunoshima/whale.glb
```

- [ ] **Step 3: whaleAnimation.tsを共通の型を使うよう更新**

`src/locations/tsunoshima/whaleAnimation.ts`の内容を以下に置き換える(ロジックは不変、`WhaleTransform`を`ArTransform`に置き換えるのみ):

```typescript
import type { ArTransform } from '../types'

// マーカー座標系(tunoshima.jpgの中心を原点、幅=1、高さ=853/1280)における
// [開始: 橋左側の海面付近, 頂点: 橋上空, 終了: 橋右側の海面付近]
const WAYPOINTS: [number, number, number][] = [
  [-0.2656, -0.0965, 0],
  [0.0469, 0.2645, 0.08],
  [0.3203, -0.0418, 0],
]

const FLIGHT_DURATION_MS = 4000
const PAUSE_DURATION_MS = 1500
export const CYCLE_DURATION_MS = FLIGHT_DURATION_MS + PAUSE_DURATION_MS

export const HIDDEN_TRANSFORM: ArTransform = {
  position: [0, 0, 0],
  rotationY: 0,
  visible: false,
}

function bezierPoint(t: number, p0: number, p1: number, p2: number): number {
  const u = 1 - t
  return u * u * p0 + 2 * u * t * p1 + t * t * p2
}

function bezierTangent(t: number, p0: number, p1: number, p2: number): number {
  return 2 * (1 - t) * (p1 - p0) + 2 * t * (p2 - p1)
}

export function getWhaleTransform(elapsedMs: number): ArTransform {
  const cycleMs = elapsedMs % CYCLE_DURATION_MS
  if (cycleMs >= FLIGHT_DURATION_MS) {
    return HIDDEN_TRANSFORM
  }

  const t = cycleMs / FLIGHT_DURATION_MS
  const [p0, p1, p2] = WAYPOINTS

  const x = bezierPoint(t, p0[0], p1[0], p2[0])
  const y = bezierPoint(t, p0[1], p1[1], p2[1])
  const z = bezierPoint(t, p0[2], p1[2], p2[2])

  const dx = bezierTangent(t, p0[0], p1[0], p2[0])
  const dz = bezierTangent(t, p0[2], p1[2], p2[2])
  const rotationY = Math.atan2(dx, dz)

  return { position: [x, y, z], rotationY, visible: true }
}
```

`src/locations/tsunoshima/whaleAnimation.test.ts`は変更不要(相対importが`./whaleAnimation`のままで解決できる)。

- [ ] **Step 4: loadWhaleModel.tsのimportパスを更新**

`src/locations/tsunoshima/loadWhaleModel.ts`の内容を以下に置き換える(`whale.glb`が同じディレクトリに移動したため相対パスのみ変更):

```typescript
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
// whale.glb: "Whale" by Quaternius (poly.pizza), CC0
import whaleModelUrl from './whale.glb?url'

// 初期見積もり値。実機での見た目を見ながら調整する
const WHALE_SCALE = 0.05
const WHALE_BASE_ROTATION_Y = 0

const loader = new GLTFLoader()

export function loadWhaleModel(): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(
      whaleModelUrl,
      (gltf) => {
        gltf.scene.scale.setScalar(WHALE_SCALE)
        gltf.scene.rotation.y = WHALE_BASE_ROTATION_Y
        const group = new THREE.Group()
        group.add(gltf.scene)
        resolve(group)
      },
      undefined,
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
    )
  })
}
```

- [ ] **Step 5: 角島大橋のLocationConfigを作成**

`src/locations/tsunoshima/index.ts`:

```typescript
import type { LocationConfig } from '../types'
import { loadWhaleModel } from './loadWhaleModel'
import { getWhaleTransform } from './whaleAnimation'

export const tsunoshimaLocation: LocationConfig = {
  id: 'tsunoshima',
  name: '角島大橋',
  guidanceText: '角島大橋を映してください',
  targetSrc: 'targets/tunoshima.mind',
  effect: {
    loadModel: loadWhaleModel,
    getTransform: getWhaleTransform,
  },
}
```

- [ ] **Step 6: テストとビルドを確認**

Run: `npm run test`
Expected: `src/locations/tsunoshima/whaleAnimation.test.ts`の4件がPASS(移動前と同じ内容)

Run: `npm run build`
Expected: エラーなく完了する(`loadWhaleModel.ts`の新しい相対パス、`index.ts`の型が正しく解決できること)

- [ ] **Step 7: コミット**

```bash
git add src/locations
git commit -m "feat: クジラ実装をsrc/locations/tsunoshimaに移行し場所の型を定義"
```

---

### Task 3: 場所レジストリ(TDD)

場所IDから`LocationConfig`を引くレジストリを作る。

**Files:**
- Create: `src/locations/index.ts`
- Test: `src/locations/index.test.ts`

**Interfaces:**
- Consumes: `tsunoshimaLocation`(Task 2, `./tsunoshima`)、`LocationConfig`(Task 2, `./types`)
- Produces: `export function getLocation(id: string): LocationConfig | undefined`、`export function listLocations(): LocationConfig[]`

- [ ] **Step 1: 失敗するテストを書く**

`src/locations/index.test.ts`:

```typescript
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/locations/index.test.ts`
Expected: FAIL(`src/locations/index.ts`が存在しない)

- [ ] **Step 3: 実装を書く**

`src/locations/index.ts`:

```typescript
import { tsunoshimaLocation } from './tsunoshima'
import type { LocationConfig } from './types'

const LOCATIONS: LocationConfig[] = [tsunoshimaLocation]

const LOCATIONS_BY_ID: Record<string, LocationConfig> = Object.fromEntries(
  LOCATIONS.map((location) => [location.id, location]),
)

export function getLocation(id: string): LocationConfig | undefined {
  return LOCATIONS_BY_ID[id]
}

export function listLocations(): LocationConfig[] {
  return LOCATIONS
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/locations/index.test.ts`
Expected: PASS(3件すべて成功)

- [ ] **Step 5: コミット**

```bash
git add src/locations/index.ts src/locations/index.test.ts
git commit -m "feat: 場所IDからLocationConfigを引くレジストリを追加"
```

---

### Task 4: ArCameraViewの一般化

クジラ専用だった`ArCameraView`を`LocationConfig`propベースに一般化する。

**Files:**
- Modify: `src/features/ar/ArCameraView.tsx`(全体を置き換え)

**Interfaces:**
- Consumes: `LocationConfig`(Task 2, `../../locations/types`)
- Produces: `export function ArCameraView(props: { location: LocationConfig; onCapture: (photoDataUrl: string) => void; onClose: () => void; onError: (message: string) => void }): JSX.Element`(Task 5で使用)

- [ ] **Step 1: ArCameraView.tsxを置き換える**

`src/features/ar/ArCameraView.tsx`の内容を以下に置き換える(クジラ専用のimport・ハードコードされたターゲットパス・案内文を、`location` propベースに変更。MindAR初期化・撮影合成・エラー処理・クリーンアップのロジックは変更なし):

```tsx
import { useEffect, useRef, useState } from 'react'
// @ts-expect-error mind-ar has no bundled TypeScript types
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js'
import * as THREE from 'three'
import type { ArTransform, LocationConfig } from '../../locations/types'
import { captureComposite } from './captureComposite'

interface ArCameraViewProps {
  location: LocationConfig
  onCapture: (photoDataUrl: string) => void
  onClose: () => void
  onError: (message: string) => void
}

const HIDDEN_TRANSFORM: ArTransform = { position: [0, 0, 0], rotationY: 0, visible: false }

export function ArCameraView({ location, onCapture, onClose, onError }: ArCameraViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // mind-arにTypeScript型定義がないため、インスタンスの型はanyになる(意図的)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mindarRef = useRef<any>(null)
  const captureRequestedRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [targetFound, setTargetFound] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    let started = false

    const mindarThree = new MindARThree({
      container: containerRef.current,
      imageTargetSrc: `${import.meta.env.BASE_URL}${location.targetSrc}`,
      uiLoading: 'no',
      uiScanning: 'no',
      uiError: 'no',
    })
    mindarRef.current = mindarThree
    const { renderer, scene, camera } = mindarThree

    const anchor = mindarThree.addAnchor(0)
    const effectGroup = new THREE.Group()
    effectGroup.visible = false
    anchor.group.add(effectGroup)

    let targetVisible = false
    let startedAt = performance.now()
    anchor.onTargetFound = () => {
      targetVisible = true
      startedAt = performance.now()
      setTargetFound(true)
    }
    anchor.onTargetLost = () => {
      targetVisible = false
      effectGroup.visible = false
      setTargetFound(false)
    }

    location.effect
      .loadModel()
      .then((model) => {
        if (cancelled) return
        effectGroup.add(model)
      })
      .catch((error) => {
        console.error('[ar] failed to load effect model', error)
        if (!cancelled) onError('エフェクトの読み込みに失敗しました')
      })

    mindarThree
      .start()
      .then(() => {
        started = true
        if (cancelled) {
          mindarThree.stop()
          return
        }
        setReady(true)
        renderer.setAnimationLoop(() => {
          const transform = targetVisible
            ? location.effect.getTransform(performance.now() - startedAt)
            : HIDDEN_TRANSFORM
          effectGroup.visible = transform.visible
          if (transform.visible) {
            effectGroup.position.set(...transform.position)
            effectGroup.rotation.y = transform.rotationY
          }
          renderer.render(scene, camera)

          if (captureRequestedRef.current) {
            captureRequestedRef.current = false
            try {
              const videoEl: HTMLVideoElement | null =
                mindarThree.video ?? containerRef.current?.querySelector('video') ?? null
              if (!videoEl) {
                onError('カメラ映像を取得できませんでした')
              } else {
                onCapture(captureComposite(videoEl, renderer.domElement))
              }
            } catch (error) {
              console.error('[ar] failed to capture photo', error)
              onError('撮影に失敗しました')
            }
          }
        })
      })
      // mindarThree.start()の戻り値は型定義がないためanyになり、
      // catchの引数も暗黙のanyになるので明示的にunknownを指定する
      .catch((error: unknown) => {
        console.error('[ar] failed to start camera/tracking', error)
        if (!cancelled) {
          onError('カメラを起動できませんでした。ブラウザの設定からカメラの使用を許可してください。')
        }
      })

    return () => {
      cancelled = true
      renderer.setAnimationLoop(null)
      if (started) {
        mindarThree.stop()
      }
      renderer.dispose()
      effectGroup.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          for (const material of materials) {
            material.dispose()
          }
        }
      })
      mindarRef.current = null
    }
  }, [location, onError])

  const handleShutter = () => {
    captureRequestedRef.current = true
  }

  return (
    <div className="camera-screen">
      <div className="video-container">
        <div className="ar-container" ref={containerRef} />
        {(!ready || !targetFound) && (
          <div className="ar-status-overlay">{!ready ? 'カメラを起動中...' : location.guidanceText}</div>
        )}
      </div>
      <div className="camera-controls">
        <button
          type="button"
          className="btn btn-shutter"
          onClick={handleShutter}
          disabled={!ready}
          title="撮影"
        >
          <span className="shutter-inner" />
        </button>
        <button type="button" className="btn btn-icon" onClick={onClose} title="閉じる">
          ✕
        </button>
      </div>
    </div>
  )
}
```

補足: `useEffect`の依存配列に`location`を追加した(場所が変わった場合に確実に再初期化されるようにするため)。呼び出し側(Task 5)では`<ArCameraView key={location.id} ... />`のように`key`も指定し、`location`オブジェクトの参照が万一変わらないケースでも再マウントされるようにする。

- [ ] **Step 2: 型チェックを確認**

Run: `npm run build`
Expected: エラーなく完了する

- [ ] **Step 3: コミット**

```bash
git add src/features/ar/ArCameraView.tsx
git commit -m "feat: ArCameraViewをLocationConfigベースに一般化"
```

---

### Task 5: App.tsxへの統合、案内画面、動作確認

**Files:**
- Create: `src/pages/GuidancePage.tsx`
- Modify: `src/App.tsx`(全体を置き換え)
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `parseRoute`(Task 1, `./router`)、`getLocation`/`listLocations`(Task 3, `./locations`)、`ArCameraView`(Task 4, `./features/ar/ArCameraView`)

- [ ] **Step 1: 案内画面コンポーネントを作成**

`src/pages/GuidancePage.tsx`:

```tsx
import { listLocations } from '../locations'

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
                <a href={`/spot/${location.id}`}>{location.name}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: App.tsxを置き換える**

`src/App.tsx`の内容を以下に置き換える:

```tsx
import { Suspense, lazy, useCallback, useState } from 'react'
import { getLocation } from './locations'
import type { LocationConfig } from './locations/types'
import { GuidancePage } from './pages/GuidancePage'
import { parseRoute } from './router'
import './App.css'

const ArCameraView = lazy(() =>
  import('./features/ar/ArCameraView').then((module) => ({ default: module.ArCameraView })),
)

type AppState = 'idle' | 'camera' | 'preview'

function resolveInitialLocation(): LocationConfig | null {
  const route = parseRoute(window.location.pathname)
  if (route.type === 'spot') {
    return getLocation(route.id) ?? null
  }
  return null
}

function App() {
  const [location] = useState<LocationConfig | null>(resolveInitialLocation)
  const [state, setState] = useState<AppState>(location ? 'camera' : 'idle')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleCapture = useCallback((dataUrl: string) => {
    setPhotoUrl(dataUrl)
    setState('preview')
  }, [])

  const handleArError = useCallback((message: string) => {
    setError(message)
    setState('idle')
  }, [])

  const retake = useCallback(() => {
    setPhotoUrl(null)
    setError(null)
    setState('camera')
  }, [])

  const downloadPhoto = useCallback(() => {
    if (!photoUrl || !location) return
    const link = document.createElement('a')
    link.href = photoUrl
    const now = new Date()
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    link.download = `shimonoseki_snap_${location.id}_${timestamp}.png`
    link.click()
  }, [photoUrl, location])

  if (!location) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>📸 ShimonosekiSnap</h1>
          <p className="subtitle">下関の思い出を写真に残そう</p>
        </header>
        <main className="app-main">
          <GuidancePage />
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      {state !== 'camera' && (
        <header className="app-header">
          <h1>📸 ShimonosekiSnap</h1>
          <p className="subtitle">下関の思い出を写真に残そう</p>
        </header>
      )}

      <main className="app-main">
        {error && (
          <div className="error-message">
            <p>⚠️ {error}</p>
          </div>
        )}

        {state === 'idle' && (
          <div className="start-screen">
            <div className="camera-icon">📷</div>
            <p>{location.name}にカメラを向けて撮影しましょう</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setError(null)
                setState('camera')
              }}
            >
              カメラを起動
            </button>
          </div>
        )}

        {state === 'camera' && (
          <Suspense fallback={<div className="camera-screen" />}>
            <ArCameraView
              key={location.id}
              location={location}
              onCapture={handleCapture}
              onClose={() => setState('idle')}
              onError={handleArError}
            />
          </Suspense>
        )}

        {state === 'preview' && photoUrl && (
          <div className="preview-screen">
            <div className="photo-container">
              <img src={photoUrl} alt="撮影した写真" className="preview-photo" />
            </div>
            <div className="preview-controls">
              <button type="button" className="btn btn-secondary" onClick={retake}>
                📷 撮り直す
              </button>
              <button type="button" className="btn btn-primary" onClick={downloadPhoto}>
                💾 保存する
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
```

- [ ] **Step 3: 案内画面用のCSSを追加**

`src/App.css`の`.start-screen p { ... }`ルールの直後に追加:

```css
.location-list {
  margin-top: 8px;
  text-align: center;
}

.location-list-label {
  font-size: 13px;
  color: var(--text);
  margin-bottom: 8px;
}

.location-list ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  margin: 0;
}

.location-list a {
  color: var(--accent);
  font-size: 15px;
  text-decoration: underline;
}
```

- [ ] **Step 4: 型チェックとテストを実行**

Run: `npm run build && npm run test`
Expected: 両方ともエラーなく完了する(テストは`router.test.ts`6件+`locations/index.test.ts`3件+`locations/tsunoshima/whaleAnimation.test.ts`4件+`features/ar/captureComposite.test.ts`3件で計16件PASS)

- [ ] **Step 5: 手動で動作確認する**

1. `npm run dev`(または`docker compose up -d`)でアプリを起動する
2. ブラウザで`/`にアクセスし、「QRコードを読み取ってください」という案内画面と、「角島大橋」への動作確認用リンクが表示されることを確認する
3. `/spot/tsunoshima`に直接アクセスし、ページ読み込みと同時にカメラ権限ダイアログが表示され、カメラ画面が自動起動することを確認する
4. `/spot/doesnotexist`のような存在しない場所IDにアクセスし、`/`と同じ案内画面が表示されることを確認する
5. カメラ画面で✕を押し、「角島大橋にカメラを向けて撮影しましょう」という場所名入りの待機画面に戻ることを確認する
6. 別モニターで`tunoshima.jpg`を表示してカメラを向け、クジラのARエフェクトが従来通り動作すること、撮影→保存時のファイル名が`shimonoseki_snap_tsunoshima_...`になっていることを確認する

- [ ] **Step 6: コミット**

```bash
git add src/App.tsx src/App.css src/pages
git commit -m "feat: 場所URLに応じたAR自動起動と案内画面をApp.tsxに統合"
```
