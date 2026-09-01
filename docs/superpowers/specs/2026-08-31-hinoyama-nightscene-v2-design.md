# 火の山公園「動く夜景」v2 設計書(ゼロベース再構築)

- 日付: 2026-08-31
- 対象: shimonoseki-snap (React + TypeScript + Vite)
- ブランチ: `feature/hinoyama-nightscene-v2`(`origin/main` から分岐)
- 位置づけ: 旧 `feature/#16`(動く夜景 v1 + 流星 GPGPU VFX)を破棄し、火の山ロケーションを作り直す。
  旧ブランチは未 push のまま温存(このブランチからは参照しない)。

## なぜ作り直すか

v1 は「光らせれば良い」的な加算スプライトの寄せ集めで、一つひとつのエフェクトが
チープ・低画質・奥行きがなく、観光客が写真を撮る体験に耐えない、というのがユーザーの評価。
今回は「見たことない、美しい」と感じて SNS に載せてもらえる質を最優先にする。
コンセプト(夜景が動き出す「動く絵葉書」)は維持。

## 「すごさ」の 4 本柱(ユーザー確認済み・優先度順)

1. 奥行き・立体感(パララックス)
2. 光と色の質(映画的な階調)
3. 有機的で詩的な動き
4. 高解像度・精密さ

## アプローチ: 2.5D レイヤード・ジオラマ(案A)

`assets/hinoyama-base.jpg`(1280x853)を奥行き 6 層のマスク済み平面としてマーカー前後に
実 3D 配置する。実カメラが動くとレイヤー間で視差が生まれ、「印刷パネルの奥に夜景が広がる窓」
に見える。色補正は読み込み時に一度だけ焼き込み、発光は生成テクスチャで表現する。

### フレームワーク変更なし

`types.ts` / `ArCameraView.tsx` / `captureComposite.ts` / `lineArtRenderer.ts` / 他ロケーションは
一切変更しない。エフェクトは `loadModel()` が返す `{ object, markerUpdate }` だけで完結する。

- `getTransform` は常に `{ position:[0,0,0], rotationX:0, rotationY:0, visible:true }`(動く主役なし)
- パララックスの視点は `object.worldToLocal(ワールド原点)` で得る。MindAR はカメラをワールド原点に
  固定しマーカー姿勢をアンカーに乗せるため、これが「視点の左右/上下ずれ」になる。フレームワークから
  カメラ参照をもらう必要がない。
- 実行時ポスト処理チェーン・RT・EffectComposer は使わない(v1 の重さ・複雑さの原因を排除)。
  Bloom 相当は加算グロースプライト、グレードは焼き込み、ヴィネット/グレインは前面プレーンで表現。

## 奥行きレイヤー(背 → 前)

| id | z(マーカー平面基準) | 内容 | 主な動き |
| --- | --- | --- | --- |
| sky | -0.045 | 生成した薄明グラデ + 微小な星 | skyBreath で残照プレーンの不透明度 |
| far | -0.022 | 遠景の稜線 + 北九州の街 | 街明かりの微かな瞬き |
| city | 0 | 下関 + 対岸の水際 | 街明かりの瞬き(稀に 1 個フレア) |
| water | +0.009 | 海峡の水面 | 船 + 航跡が STRAIT_PATH に沿って横断 |
| bridge | +0.016 | 関門橋 | 赤ビーコンの明滅、光の脈動が桁を流れる |
| near | +0.046 | 手前の斜面・家並み・道路 | 車のテールランプが道路を流れる |

- 各レイヤーは `sceneTrace.LAYER_DEFS` の多角形(画像 UV)で切り抜き、`feather` ぶんぼかす。
- `sky` 以外は元画像全域を持ち、アルファだけで帯を制限する ⇒ 視差でずれても背面に必ず絵がある(穴なし)。
- `scaleComp ≈ 1 + z` でヘッドオン時の見かけサイズを揃える。

## モジュール(すべて `src/locations/hinoyama/`)

| ファイル | 責務 | テスト |
| --- | --- | --- |
| `index.ts` | `LocationConfig`(id `hinoyama`) | locations/index.test.ts に追加 |
| `sceneTrace.ts` | トレース済み座標(レイヤー多角形・z、海峡/橋パス、空グラデ、街の領域、道路パス)+ 純ヘルパー(`imageToMarker` / `sampleSpline` / `pointInPolygon` / `mulberry32`) | ◯ |
| `motionTimeline.ts` | `elapsedMs` → 全アニメ状態(船×3・ビーコン・橋の脈動・空の呼吸・haze・車)。CYCLE 24s、認識ごとに頭出し | ◯ |
| `parallax.ts` | 視点ずれ → レイヤーごとの追加オフセット(`viewVector` 飽和 + `parallaxOffset` クランプ) | ◯ |
| `lightField.ts` | 輝度グリッド → 局所最大の光点(NMS)。`rgbaToLuma` も | ◯ |
| `imageGrade.ts` | lift/gamma/gain + 彩度 + ACES の純粋数式。`NIGHT_GRADE` 定数 | ◯ |
| `textures.ts` | Canvas2D 生成(グロー・筋・空・残照・グレイン・ヴィネット) | GPU/DOM |
| `buildDiorama.ts` | 写真デコード→グレード焼き込み→6 レイヤー平面 + 発光スプライト + 前面オーバーレイ。`update(elapsedMs, viewX, viewY)` | GPU/DOM |
| `loadNightScene.ts` | 画像ロード → buildDiorama → `markerUpdate` 配線 | GPU/DOM |

## 色と発光

- 読み込み時に写真全体へ `NIGHT_GRADE`(シャドウを寒色へ・ハイライトを暖色へ・中間を締めて彩度 -10%・ACES)を
  焼き込み。実行時コストゼロ、バンディングやにじみが出ない。
- 発光は写真ピクセルを光らせず、`lightField` が抽出した実際の光位置に生成グロースプライトを置く
  (解像度非依存でシャープ)。色は焼き込み済み画素をサンプルし、街の領域で暖色/寒色へ寄せる。
- 前面オーバーレイ(視差の外・マーカー正面固定): 残照(加算・skyBreath 連動)、フィルムグレイン(微量加算・スクロール)、ヴィネット(通常合成)。

## 精密さ・負荷

- 共有レンダラーが DPR 等倍で描画。レイヤーテクスチャは幅 1024 上限、mipmap + anisotropy 8。
- 深度は使わず `depthTest:false` + `renderOrder` の画家順(シーンには夜景しかない)。
- 6 レイヤー平面 + 数百の共有テクスチャスプライト。GPGPU も RT も無し。中位スマホで軽い。

## テスト結果

- 新規ユニットテスト 88 本(sceneTrace 21 / motionTimeline 20 / parallax 8 / lightField 9 / imageGrade 10 + locations 追加)。
- `npx tsc -b` / `oxlint` / `vite build` すべて通過。GPU/AR 部分は実機チューニング前提。

## 実機チューニング項目(実装後)

対象端末で `/spot/hinoyama` を開き、`Hinoyama.jpg` 印刷パネルを認識させて確認。HMR では
AR セッションが作り直されないため、変更後はタブを完全リロードする。

- パララックスの効き(`PARALLAX_BOOST` / `PARALLAX_MAX_SHIFT` / `VIEW_FALLOFF`、`LAYER_DEFS[].z`)
- レイヤー多角形の境界が実パネルと合うか(`LAYER_DEFS[].polygons` / `feather`)
- ナイトグレードの階調(`NIGHT_GRADE`)、ヴィネット/グレインの量(`buildDiorama` の overlay opacity)
- 発光の密度・色(`extractLightPoints` の threshold/maxPoints、`sampleColor` の彩度係数)
- 船・ビーコン・橋の脈動・車のタイミング(`motionTimeline` の各定数)
- 撮影(`captureComposite` は無変更)で夜景+発光が破綻なく 1 枚に写るか、ロスト時にきれいに消えるか

## スコープ外

- 単体 HTML/CDN デモ、GPGPU パーティクル、実行時ポスト処理チェーン
- 深度マップ生成・ランタイム深度推定(案B。夜景写真では稜線・橋が溶けるため不採用)
- 他 3 ロケーションへの影響(このブランチは hinoyama 追加のみ)
- QR コード画像・パネルの物理制作
- `hinoyama.mind` の再コンパイル(旧 `feature/#16` の成果物を流用。同じ `Hinoyama.jpg` 由来)
