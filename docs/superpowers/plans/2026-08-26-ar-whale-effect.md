# ARクジラエフェクト Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** カメラで`tunoshima.jpg`(角島大橋)の写真を認識すると、橋の上をクジラが飛んで海に戻るARアニメーションを表示し、その瞬間を写真として保存できるようにする。

**Architecture:** MindAR.js(`MindARThree`)で画像ターゲット(`tunoshima.jpg`をコンパイルした`.mind`ファイル)をリアルタイムトラッキングし、Three.jsでマーカーに追従するクジラの3Dモデルをレンダリングする。撮影時はvideo映像とThree.jsのWebGLキャンバスを1枚のcanvasに合成してdataURLを生成する。クジラの飛行軌道は自前の純粋関数(ベジェ曲線ベース)で計算し、vitestで単体テストする。

**Tech Stack:** React + TypeScript + Vite(既存)、`mind-ar`(画像トラッキング)、`three`(3Dレンダリング)、`vitest`(新規追加、純粋ロジックの単体テストのみに使用)

**Spec:** `docs/superpowers/specs/2026-08-26-ar-whale-effect-design.md`

## Global Constraints

- `three`は`0.160.0`に厳密固定する(`mind-ar@1.2.5`が内部で参照する`sRGBEncoding`エクスポートが`three@0.165.0`以降で削除されているため、それ以降のバージョンでは実行時に壊れる)
- `mind-ar`は`1.2.5`に固定する
- `mind-ar`にはTypeScriptの型定義が同梱されていない。プロジェクトの`tsconfig.app.json`は`strict`を有効化していないため、`mind-ar`からのインポートは暗黙的に`any`型として扱われる(意図的な挙動であり、追加の型宣言ファイルは作成しない)
- 新規テストは`vitest`を使うが、対象はDOM/WebGL/カメラに依存しない純粋ロジック(`whaleAnimation.ts`、`captureComposite.ts`)のみとする。カメラ・AR表示・撮影の統合部分はブラウザでの手動確認とする
- 既存のCSSクラス(`btn`, `btn-icon`, `btn-shutter`, `camera-controls`, `camera-screen`, `video-container`等)を可能な限り再利用し、新規クラスは最小限に留める
- カメラの前面/背面切り替え機能はスコープ外とする(`MindARThree`に単純な`facingMode`切り替えオプションがないため、既存の切り替えボタンはこの計画では復元しない。将来の別タスクとする)
- クジラの軌道座標(waypoints)・スケール・回転オフセットは初期見積もり値であり、Task 6の手動確認で見た目を見ながら調整する前提の値である

---

### Task 1: 依存関係の追加とテスト基盤(vitest)のセットアップ

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Modify: `tsconfig.node.json`

**Interfaces:**
- Produces: `npm run test`(vitestをrunモードで実行するスクリプト)

- [ ] **Step 1: 依存パッケージをバージョン固定でインストール**

```bash
npm install mind-ar@1.2.5 three@0.160.0
npm install -D vitest
```

- [ ] **Step 2: package.jsonに`test`スクリプトを追加**

`package.json`の`scripts`セクションを以下のように変更する:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview",
    "test": "vitest run"
  },
```

- [ ] **Step 3: vitest.config.tsを作成**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: tsconfig.node.jsonの`include`に`vitest.config.ts`を追加**

`tsconfig.node.json`の`include`を以下のように変更する:

```json
  "include": ["vite.config.ts", "vitest.config.ts"]
```

- [ ] **Step 5: ベースラインのビルドが壊れていないことを確認**

Run: `npm run build`
Expected: エラーなく完了する(この時点では`mind-ar`/`three`はまだどこからも import されていないため、バージョン互換性の問題はここでは検出されない。実際の互換性確認はTask 5で行う)

- [ ] **Step 6: コミット**

```bash
git add package.json package-lock.json vitest.config.ts tsconfig.node.json
git commit -m "feat: mind-ar/threeの依存追加とvitestセットアップ"
```

---

### Task 2: ARターゲット画像のコンパイル(.mindファイル生成)

このタスクはブラウザでのファイルアップロード操作が必要で、スクリプトから自動化できない(調査の結果、`.mind`ファイルを生成するCLI/npmスクリプトによる公式な方法は存在せず、公式のブラウザ上のコンパイラツールを使うのが標準的な手順)。claude-in-chromeツールが使える場合はそれで実施し、使えない場合はユーザーに手動で行ってもらう。

**Files:**
- Create: `public/targets/tunoshima.mind`(バイナリファイル、ブラウザツールでの生成物をそのまま配置する)

- [ ] **Step 1: コンパイラページを開く**

`https://hiukim.github.io/mind-ar-js-doc/tools/compile/` を新しいブラウザタブで開く。

- [ ] **Step 2: `tunoshima.jpg`をアップロードする**

ページのファイルアップロード欄にリポジトリルートの`tunoshima.jpg`を選択してアップロードする。クライアントサイドでコンパイルが実行される(数秒〜数十秒)。

- [ ] **Step 3: コンパイル結果をダウンロードする**

コンパイル完了後に表示される「Download」ボタンから`targets.mind`をダウンロードする。

- [ ] **Step 4: リポジトリに配置する**

```bash
mkdir -p public/targets
mv ~/Downloads/targets.mind public/targets/tunoshima.mind
```

(ダウンロード先ディレクトリは環境によって異なるため、実際のダウンロード場所に合わせて調整する)

- [ ] **Step 5: 検証**

Run: `ls -la public/targets/tunoshima.mind`
Expected: サイズが0バイトでないバイナリファイルが存在する(通常は数十〜数百KB程度)

- [ ] **Step 6: コミット**

```bash
git add public/targets/tunoshima.mind
git commit -m "feat: 角島大橋の画像ターゲットデータを追加"
```

---

### Task 3: クジラの飛行アニメーションロジック(TDD)

マーカー座標系(`tunoshima.jpg`の中心を原点とした実寸相対座標。画像は1280×853pxなので幅=1、高さ=853/1280≈0.6664)上で、橋の左側の海面付近→橋上空(アーチの頂点)→橋の右側の海面付近、という3点を制御点とする2次ベジェ曲線でクジラの軌道を定義する。

**Files:**
- Create: `src/features/ar/whaleAnimation.ts`
- Test: `src/features/ar/whaleAnimation.test.ts`

**Interfaces:**
- Produces:
  - `export interface WhaleTransform { position: [number, number, number]; rotationY: number; visible: boolean }`
  - `export const CYCLE_DURATION_MS: number`(1サイクル=飛行+ポーズの合計時間)
  - `export function getWhaleTransform(elapsedMs: number): WhaleTransform`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/ar/whaleAnimation.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { CYCLE_DURATION_MS, getWhaleTransform } from './whaleAnimation'

describe('getWhaleTransform', () => {
  it('starts at the first waypoint and is visible at the beginning of a cycle', () => {
    const result = getWhaleTransform(0)
    expect(result.visible).toBe(true)
    expect(result.position[0]).toBeCloseTo(-0.2656, 3)
    expect(result.position[1]).toBeCloseTo(-0.0965, 3)
    expect(result.position[2]).toBeCloseTo(0, 3)
  })

  it('is at the interpolated midpoint halfway through the flight', () => {
    const result = getWhaleTransform(2000)
    expect(result.visible).toBe(true)
    expect(result.position[0]).toBeCloseTo(0.0372, 3)
    expect(result.position[1]).toBeCloseTo(0.0977, 3)
    expect(result.position[2]).toBeCloseTo(0.04, 3)
  })

  it('is hidden during the pause after the flight completes', () => {
    const atFlightEnd = getWhaleTransform(4000)
    expect(atFlightEnd.visible).toBe(false)

    const midPause = getWhaleTransform(4500)
    expect(midPause.visible).toBe(false)
  })

  it('loops back to the same transform every CYCLE_DURATION_MS', () => {
    const first = getWhaleTransform(100)
    const secondCycle = getWhaleTransform(CYCLE_DURATION_MS + 100)
    expect(secondCycle).toEqual(first)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/features/ar/whaleAnimation.test.ts`
Expected: FAIL(`whaleAnimation.ts`が存在しない、または`getWhaleTransform`が未定義というエラー)

- [ ] **Step 3: 実装を書く**

`src/features/ar/whaleAnimation.ts`:

```typescript
export interface WhaleTransform {
  position: [number, number, number]
  rotationY: number
  visible: boolean
}

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

const HIDDEN_TRANSFORM: WhaleTransform = {
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

export function getWhaleTransform(elapsedMs: number): WhaleTransform {
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

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/features/ar/whaleAnimation.test.ts`
Expected: PASS(4件すべて成功)

- [ ] **Step 5: コミット**

```bash
git add src/features/ar/whaleAnimation.ts src/features/ar/whaleAnimation.test.ts
git commit -m "feat: クジラの飛行軌道ロジックを追加"
```

---

### Task 4: 撮影合成ユーティリティ(TDD)

video映像とThree.jsのWebGLキャンバス(クジラの描画結果)を1枚のcanvasに合成し、dataURLとして書き出す関数を作る。テスト容易性のため、実際に描画に使うcanvasを差し替え可能にする(`createCanvas`引数)。

**Files:**
- Create: `src/features/ar/captureComposite.ts`
- Test: `src/features/ar/captureComposite.test.ts`

**Interfaces:**
- Produces: `export function captureComposite(video: HTMLVideoElement, overlayCanvas: HTMLCanvasElement, createCanvas?: () => HTMLCanvasElement): string`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/ar/captureComposite.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { captureComposite } from './captureComposite'

describe('captureComposite', () => {
  it('draws the video frame then the overlay canvas onto a canvas sized to the video, and returns a data URL', () => {
    const drawImage = vi.fn()
    const toDataURL = vi.fn().mockReturnValue('data:image/png;base64,FAKE')
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toDataURL,
    }
    const video = { videoWidth: 640, videoHeight: 480 } as unknown as HTMLVideoElement
    const overlayCanvas = { width: 640, height: 480 } as unknown as HTMLCanvasElement

    const result = captureComposite(video, overlayCanvas, () => fakeCanvas as unknown as HTMLCanvasElement)

    expect(fakeCanvas.width).toBe(640)
    expect(fakeCanvas.height).toBe(480)
    expect(drawImage).toHaveBeenNthCalledWith(1, video, 0, 0, 640, 480)
    expect(drawImage).toHaveBeenNthCalledWith(2, overlayCanvas, 0, 0, 640, 480)
    expect(result).toBe('data:image/png;base64,FAKE')
  })

  it('throws when a 2D context is unavailable', () => {
    const fakeCanvas = { width: 0, height: 0, getContext: () => null, toDataURL: () => '' }
    const video = { videoWidth: 640, videoHeight: 480 } as unknown as HTMLVideoElement
    const overlayCanvas = {} as unknown as HTMLCanvasElement

    expect(() =>
      captureComposite(video, overlayCanvas, () => fakeCanvas as unknown as HTMLCanvasElement),
    ).toThrow('2D context is not available')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/features/ar/captureComposite.test.ts`
Expected: FAIL(`captureComposite.ts`が存在しない)

- [ ] **Step 3: 実装を書く**

`src/features/ar/captureComposite.ts`:

```typescript
export function captureComposite(
  video: HTMLVideoElement,
  overlayCanvas: HTMLCanvasElement,
  createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas'),
): string {
  const canvas = createCanvas()
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('2D context is not available')
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  ctx.drawImage(overlayCanvas, 0, 0, canvas.width, canvas.height)

  return canvas.toDataURL('image/png')
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/features/ar/captureComposite.test.ts`
Expected: PASS(2件とも成功)

- [ ] **Step 5: コミット**

```bash
git add src/features/ar/captureComposite.ts src/features/ar/captureComposite.test.ts
git commit -m "feat: video+ARキャンバスの合成撮影ユーティリティを追加"
```

---

### Task 5: クジラモデルの取得とArCameraViewコンポーネント

**Files:**
- Create: `src/assets/models/whale.glb`(CC0のフリー素材、Poly Pizza「Whale」by Quaternius)
- Create: `src/features/ar/loadWhaleModel.ts`
- Create: `src/features/ar/ArCameraView.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes:
  - `getWhaleTransform(elapsedMs: number): WhaleTransform`, `CYCLE_DURATION_MS`(Task 3)
  - `captureComposite(video, overlayCanvas, createCanvas?): string`(Task 4)
  - `public/targets/tunoshima.mind`(Task 2)
- Produces: `export function ArCameraView(props: { onCapture: (photoDataUrl: string) => void; onClose: () => void; onError: (message: string) => void }): JSX.Element`(Task 6で使用)

- [ ] **Step 1: クジラの3Dモデルをダウンロードする**

```bash
mkdir -p src/assets/models
curl -L -o src/assets/models/whale.glb https://static.poly.pizza/7300e697-2543-4a9a-a77d-dedf29251fd7.glb
```

- [ ] **Step 2: 検証**

Run: `ls -la src/assets/models/whale.glb`
Expected: ファイルサイズが約67KB(68,764バイト)

- [ ] **Step 3: モデルローダーを書く**

`src/features/ar/loadWhaleModel.ts`:

```typescript
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import whaleModelUrl from '../../assets/models/whale.glb?url'

// 初期見積もり値。実機での見た目を見ながら調整する(Task 6で確認)
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

- [ ] **Step 4: ArCameraViewコンポーネントを書く**

`src/features/ar/ArCameraView.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js'
import * as THREE from 'three'
import { captureComposite } from './captureComposite'
import { loadWhaleModel } from './loadWhaleModel'
import { getWhaleTransform, type WhaleTransform } from './whaleAnimation'

interface ArCameraViewProps {
  onCapture: (photoDataUrl: string) => void
  onClose: () => void
  onError: (message: string) => void
}

const HIDDEN_TRANSFORM: WhaleTransform = { position: [0, 0, 0], rotationY: 0, visible: false }

export function ArCameraView({ onCapture, onClose, onError }: ArCameraViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // mind-arにTypeScript型定義がないため、インスタンスの型はanyになる(意図的)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mindarRef = useRef<any>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    const mindarThree = new MindARThree({
      container: containerRef.current,
      imageTargetSrc: '/targets/tunoshima.mind',
    })
    mindarRef.current = mindarThree
    const { renderer, scene, camera } = mindarThree

    const anchor = mindarThree.addAnchor(0)
    const whaleGroup = new THREE.Group()
    whaleGroup.visible = false
    anchor.group.add(whaleGroup)

    let targetVisible = false
    anchor.onTargetFound = () => {
      targetVisible = true
    }
    anchor.onTargetLost = () => {
      targetVisible = false
      whaleGroup.visible = false
    }

    const startedAt = performance.now()

    loadWhaleModel()
      .then((whale) => {
        if (cancelled) return
        whaleGroup.add(whale)
      })
      .catch(() => {
        if (!cancelled) onError('クジラモデルの読み込みに失敗しました')
      })

    mindarThree
      .start()
      .then(() => {
        if (cancelled) return
        setReady(true)
        renderer.setAnimationLoop(() => {
          const transform = targetVisible
            ? getWhaleTransform(performance.now() - startedAt)
            : HIDDEN_TRANSFORM
          whaleGroup.visible = transform.visible
          if (transform.visible) {
            whaleGroup.position.set(...transform.position)
            whaleGroup.rotation.y = transform.rotationY
          }
          renderer.render(scene, camera)
        })
      })
      .catch(() => {
        if (!cancelled) {
          onError('カメラを起動できませんでした。ブラウザの設定からカメラの使用を許可してください。')
        }
      })

    return () => {
      cancelled = true
      renderer.setAnimationLoop(null)
      mindarThree.stop()
      mindarRef.current = null
    }
  }, [onError])

  const handleShutter = () => {
    const mindarThree = mindarRef.current
    if (!mindarThree) return
    const videoEl: HTMLVideoElement | null =
      mindarThree.video ?? containerRef.current?.querySelector('video') ?? null
    if (!videoEl) {
      onError('カメラ映像を取得できませんでした')
      return
    }
    const photoDataUrl = captureComposite(videoEl, mindarThree.renderer.domElement)
    onCapture(photoDataUrl)
  }

  return (
    <div className="camera-screen">
      <div className="video-container ar-container" ref={containerRef} />
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

- [ ] **Step 5: CSSを追加**

`src/App.css`の`.video-container`ルールの直後に追加:

```css
.ar-container {
  position: relative;
}

.ar-container video,
.ar-container canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

- [ ] **Step 6: 型チェックを確認**

Run: `npm run build`
Expected: エラーなく完了する(`mind-ar`のimportが解決でき、`three@0.160.0`との互換性に問題がないこと。ここで`sRGBEncoding`関連のエラーが出た場合はTask 1のバージョン固定を再確認する)

- [ ] **Step 7: コミット**

```bash
git add src/assets/models/whale.glb src/features/ar/loadWhaleModel.ts src/features/ar/ArCameraView.tsx src/App.css
git commit -m "feat: MindARによるクジラAR表示コンポーネントを追加"
```

---

### Task 6: App.tsxへの統合と動作確認

**Files:**
- Modify: `src/App.tsx`(全体を置き換え)

**Interfaces:**
- Consumes: `ArCameraView`(Task 5)

- [ ] **Step 1: App.tsxを置き換える**

`src/App.tsx`の内容を以下に置き換える:

```tsx
import { useCallback, useState } from 'react'
import { ArCameraView } from './features/ar/ArCameraView'
import './App.css'

type AppState = 'idle' | 'camera' | 'preview'

function App() {
  const [state, setState] = useState<AppState>('idle')
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
    if (!photoUrl) return
    const link = document.createElement('a')
    link.href = photoUrl
    const now = new Date()
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    link.download = `shimonoseki_snap_${timestamp}.png`
    link.click()
  }, [photoUrl])

  return (
    <div className="app">
      <header className="app-header">
        <h1>📸 ShimonosekiSnap</h1>
        <p className="subtitle">下関の思い出を写真に残そう</p>
      </header>

      <main className="app-main">
        {error && (
          <div className="error-message">
            <p>⚠️ {error}</p>
          </div>
        )}

        {state === 'idle' && (
          <div className="start-screen">
            <div className="camera-icon">📷</div>
            <p>カメラを起動して写真を撮影しましょう</p>
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
          <ArCameraView onCapture={handleCapture} onClose={() => setState('idle')} onError={handleArError} />
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

- [ ] **Step 2: 型チェックとテストを実行**

Run: `npm run build && npm run test`
Expected: 両方ともエラーなく完了する

- [ ] **Step 3: 手動でAR動作を確認する**

1. 別モニター(またはタブレット/別スマホ)で`tunoshima.jpg`を表示する
2. `docker compose up -d`(または`npm run dev`)でアプリを起動し、スマートフォン実機のブラウザからアクセスする(HTTPS/localhost環境が必要な場合はカメラ権限の許可ダイアログに従う)
3. 「カメラを起動」を押し、カメラを別モニターの`tunoshima.jpg`に向ける
4. 画像が認識されクジラが橋の上を飛んで海に戻るアニメーションがループ表示されることを確認する
5. カメラ(モニター)を動かして、クジラの軌道が橋の遠近・角度に追従することを確認する
6. 見た目が不自然な場合、`loadWhaleModel.ts`の`WHALE_SCALE`/`WHALE_BASE_ROTATION_Y`、`whaleAnimation.ts`の`WAYPOINTS`を調整して再確認する
7. シャッターボタンを押し、プレビュー画面でクジラが写り込んだ写真が表示されることを確認する
8. 「保存する」で画像がダウンロードされること、「撮り直す」で再度カメラ+ARが起動することを確認する

- [ ] **Step 4: コミット**

```bash
git add src/App.tsx
git commit -m "feat: ARクジラエフェクトをカメラ撮影フローに統合"
```
