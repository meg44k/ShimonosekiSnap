# クジラの2次元線画ルック 設計書

- 日付: 2026-08-28
- 対象プロジェクト: shimonoseki-snap (React + TypeScript + Vite)
- 前提:
  - `docs/superpowers/specs/2026-08-26-ar-whale-effect-design.md`(角島大橋+クジラのARエフェクト)
  - `docs/superpowers/specs/2026-08-27-multi-location-support-design.md`(複数場所対応フレームワーク)
  - 上記2つの実装が完了しており、現在 `feature/#7` で「クジラの見た目を安っぽくしない」改善を継続中であること

## 背景 / 目的

現在のクジラは3DのGLBモデルに、縁が光るフレネル(縁光り)マテリアル(`glowMaterial.ts`)を適用したものになっている。これに対して「チープ・雄大さがない」というフィードバックが繰り返し出ている。

目標とする質感は、参考イラスト(`kuzira_irasuto.jpeg`: 暗い夜空に白い輪郭線だけで描かれた、陰影のない平面的なザトウクジラが、ゆうゆうと斜めに昇っていく絵)。この「手描きの2次元線画のクジラがゆったり動いている」印象をARで実現する。

ただし「2次元イラストを1枚のスプライトとして貼り付けて移動させるだけ」は明確に避ける。線はあくまで**3Dのクジラの形と動きから毎フレーム生成**し、向きの変化・体のしなり・ヒレの動きに正しく追従させる。

## 決定事項(ブレインストーミングの結果)

| 論点 | 決定 |
| --- | --- |
| 目指す質感 | **B: 基本は平面の線画。ただし遊泳で胴体がしなる/ヒレ・尾が動く/向きが変わると最小限のパースがつく**。「紙の絵が生きて動いている」印象。完全な無変化の平面(A)でも、セル画的な立体(C)でもない |
| クジラの動き(演出) | **A: 現行の演出を維持**。海から飛び出して橋上空を弧を描き、また海に潜る(飛行 5.5秒 + 休止 1.5秒でループ)。海面クリッピング・水しぶき・休止ループもそのまま。画風だけ変える |
| 明るい背景での可読性 | **A: 線のまわりに柔らかい暗いフチ(ハロー)を出す**。「発光する線画」。ボディ塗りは無し、または極薄。写真の上に暗い霞(スクリム)を敷く方式(C)は採らない |
| 線のゆらぎ(boil) | **あり**。線が数コマに1回ずつ微妙に揺れる、手描きアニメ調。「描かれ続けている」印象を出すための中核技法 |
| どの線を描くか | **輪郭(シルエット)+ 主要な内側の線**(喉のすじ・口・胸ビレの付け根・尾ビレ等、モデルの折り目)。輪郭のみにはしない |
| 実現方式 | **ポストプロセスのエッジ検出**。クジラを法線+深度バッファに描き、Sobelフィルタで輪郭・折り目を一括で線化する。線はモデルの実形状・変形・回転から毎フレーム導出される |
| クジラの3Dモデル | **差し替える**。後述 |

### 実現方式の選定理由

エッジ検出方式(ポストプロセス)を選んだ理由:

- 輪郭も内側の折り目も一括で線化でき、線がモデルの形・スキニング変形・回転から毎フレーム導出されるため、「2Dを動かしただけ」から最も遠い
- boil(Sobelのサンプル位置を時間量子化ノイズでずらす)と相性が良く、絵全体がコヒーレントに揺れる
- ハロー(エッジマスクの膨張+暗色)も同じポストシェーダー内で完結する
- 陰影ゼロが自動(エッジしか描かないため)

代替案として「シェーダー輪郭線(インバーテッドハル)+ 手描きの内側ライン」も検討した。描画パイプラインを触らずに済む利点があるが、内側の線を手作業で配置・調整する必要があり、曲がり方も近似になる。実機でエッジ検出方式の負荷・品質が許容できない場合の退避先とする。

`EdgesGeometry` による線ジオメトリ事前生成は、なめらかなクジラの体ではハードエッジがほぼ無く線がスカスカになる上、スキニングに追従しないため不採用。

## 3Dモデルの差し替え

### 背景

現行モデル(`whale.glb`, "Whale" by Quaternius, Poly Pizza, CC0)は 447三角形・2マテリアル(2色ベタ塗り)・13ボーンの低ポリ ゲームアセット。胸ビレ・尾ビレは単純な板で、参考イラストにある「長く湾曲した胸ビレ」「体のアーチ」「こぶのある頭」といった形の情報が入っていない。エッジ検出方式は「モデルのシルエットと折り目を忠実に線にする」ため、元モデルのプロポーションと作り込みが結果の上限を決める。低ポリのクジラを線画にしても低ポリの線画にしかならない。

### スパイク結果(使えるモデルの調査)

- CC0 のリグ付き・アニメ付きザトウクジラは実質存在しない。使えるものは全て CC-BY(帰属表示が必要)。現行実装も帰属コメント付きで運用しており、パターンとしては既にある
- glb/gltf は Sketchfab の "Download 3D Model" で自動変換版が取得可能

### 採用モデル

[Connlan_Immure「Humpback Whale (Swimming)」](https://sketchfab.com/3d-models/humpback-whale-swimming-f4912be9163a4f45b2480df8ccb8b2c6)

- ライセンス: CC-BY-4.0(商用可、要クレジット)
- ZBrushスカルプトの有機的なザトウクジラ。実物のプロポーション(長い胸ビレ・体のアーチ)がある
- リグ: 15ボーン(`_rootJoint → Core_Joint_00 → Tail_J1..J5` の尾5連鎖、`Head_J1`、左右胸ビレ3連鎖)、SkinnedMesh
- アニメ: `Take 001` 1本、10秒 / 30fps。尾連鎖の回転(推進の尾振り)+頭+胸ビレの動き。`Core_Joint_00` の translation は前進ではなくY方向の上下バウンド(±0.5、開始値に戻る=ループ整合)。ルートモーションではないため編集不要
- 頭の向き: モデルローカルで **-X方向**(現コードの「+Z=頭」とは異なるため基準回転で吸収する)

### モデルの整形

Sketchfab の glTF エクスポート(`scene.gltf` + `scene.bin` + テクスチャ3枚 計約25MB)を、以下の手順で単一 glb(約286KB)に整形する。整形スクリプトは `scripts/` 配下に置き、再実行可能にする。

1. glTF JSON から `images` / `textures` / `samplers`(テクスチャ用)を削除。マテリアルのテクスチャ参照を外し、フラットな `baseColorFactor` に置換。メッシュから `TEXCOORD_0/1/2` / `TANGENT` / `COLOR_0` を削除(エッジ検出は法線バッファのみ使用、テクスチャは一切不要)
2. `gltf-transform prune`(孤立ノード・アクセサの除去)
3. `gltf-transform resample`(可逆のキーフレーム重複除去、356KB → 286KB)
4. 検証: エラー0。警告は `NODE_SKINNED_MESH_NON_ROOT`(初回描画で軌道追従を要確認)、`ACCESSOR_JOINTS_USED_ZERO_WEIGHT`(無害)

整形後の内訳: 6,592三角形 / 3,525頂点、属性は POSITION / NORMAL / JOINTS_0 / WEIGHTS_0 のみ、`Take 001` 10秒を保持。

### 帰属表示

CC-BY-4.0 のクレジット文(`license.txt` の指定文言)を、コードのコメントだけでなくアプリ内のユーザーが確認できる場所(例: 案内画面のフッター、または「i」表示)に1箇所追加する。現行モデルの帰属も同様に扱う。

## アーキテクチャ

### レンダリングパイプライン

現在の描画ループは毎フレーム `renderer.render(scene, camera)` の1回のみ。これを3ステップに組み替える。`EffectComposer` は導入せず、既存のクリッピング平面の手動管理と同じく手書きループ内で管理する。

**レイヤー分け**

- クジラのメッシュ → 専用レイヤー(layer 1)に隔離
- スパークル等の光る粒・水しぶき → layer 0(線画化の対象外、加算合成のスプライトとしてそのまま描く)

**毎フレームの処理**

1. **法線プリパス**: `scene.overrideMaterial = MeshNormalMaterial` にして layer 1(クジラのみ)を `DepthTexture` 付きレンダーターゲット `rtNormal` に描画。ビュー空間法線がRGB、深度が深度テクスチャに入る。スキニング(遊泳)と海面クリッピングはこのパスでも有効にする(オーバーライドマテリアルにも `clippingPlanes` を設定、`clipping` 有効)
2. **エッジ検出パス**: 全画面三角形1枚に自作 `ShaderMaterial`。`rtNormal` の法線と深度に Sobel をかけて線を出し、画面(`renderer.domElement`)へ直接描く。背景は透明のまま(クジラのある所だけ α > 0)
3. **オーバーレイパス**: layer 0(スパークル・水しぶき)を通常描画で上に重ねる(clear しない)

`captureComposite(video, renderer.domElement)` は最終出力が従来どおり `renderer.domElement` に乗るため変更不要。

### 新規ファイル

| ファイル | 役割 |
| --- | --- |
| `src/features/ar/lineArtRenderer.ts` | エッジ検出パイプライン。`rtNormal`(DepthTexture付きレンダーターゲット)、`MeshNormalMaterial` オーバーライドインスタンス、全画面エッジ検出 `ShaderMaterial` と ortho scene、`setSize(w, h)` / `render(renderer, scene, camera)` / `dispose()` を公開。GLSL(Sobel + boil + ハロー)とパラメータ定数もここに集約。クジラ固有ではなく「線画化したいレイヤー + カメラ」を扱う汎用モジュール |
| `scripts/process-whale-model.mjs` | モデル整形の再現用スクリプト(上記「モデルの整形」の手順) |

### 既存ファイルへの変更

- `src/features/ar/ArCameraView.tsx`:
  - クジラのメッシュを専用レイヤー(layer 1)に設定
  - 描画ループを「法線プリパス → エッジ検出パス → layer 0 オーバーレイ」に組み替え
  - `lineArtRenderer` の生成・`setSize`(初期化時 + リサイズ時)・`dispose`(アンマウント時)を配線
  - `renderer.shadowMap` 関連の設定を削除
  - 起動時に `renderer.capabilities.isWebGL2` を確認し、非対応なら `onError` で通知(DepthTexture 前提)
- `src/locations/tsunoshima/loadWhaleModel.ts`:
  - モデルを `whale.glb` → `humpback-whale.glb` に変更
  - `createWhaleGlowMaterial` の使用を撤去し、メッシュに軽量なフラットマテリアルを設定(実際にはオーバーライドマテリアル下でしか描かれないが、有効な材質は必要)
  - `mergeVertices` + `computeVertexNormals` は維持(Sobelの綺麗さのため従来以上に重要)
  - 頭が -X 方向のため `WHALE_BASE_ROTATION_Y` を調整(進行方向の符号は実機で確定)
  - `WHALE_SCALE` を再調整(モデル全長が約27ユニットに変わるため)
  - swim mixer と `animationSpeed` 連動、`SEA_LEVEL_Y` クリッピング、水しぶきの `markerObject`/`markerUpdate`、スパークルは維持
  - `createGroundShadow` の使用を撤去(フラットな線画に3Dのソフトシャドウは画風が合わない)
- `src/locations/types.ts`:
  - `LoadedEffectModel` に線画化対象であることを示すフラグを追加(例: `lineArt?: boolean`。対象は既存の `object`)
- `src/locations/tsunoshima/index.ts` または `src/pages/GuidancePage.tsx`:
  - CC-BY クレジット表示を1箇所追加

### 削除するファイル

- `src/locations/tsunoshima/glowMaterial.ts`
- `src/locations/tsunoshima/groundShadow.ts`

### 変更しないファイル

- `src/locations/tsunoshima/whaleAnimation.ts` とそのテスト(演出Aを維持)
- `src/locations/tsunoshima/splashTrigger.ts` / `splashParticles.ts` / `sparkleParticles.ts` / `seaLevel.ts`
- `captureComposite.ts`、`whale.glb`(動作確認できるまで残置)

## エッジ検出シェーダーの挙動

すべて1パス内で完結させる。

**エッジ検出**

- 法線 Sobel と深度 Sobel を別々に計算し、`edge = max(normalEdge, depthEdge)`
- 深度は線形化してから差分(遠近で線の太さが変わらないように)
- `edge` を `smoothstep(t0, t1, edge)` でしきい値処理してくっきりした線にする
- 法線をスムーズ化済み(`mergeVertices` + `computeVertexNormals`)なので、体のなめらかな面には線が出ず、折れのある所(喉のすじ・口・ヒレの付け根・尾)に内側の線が出る。輪郭はシルエット(深度の段差)で出る

**boil(手描きのゆらぎ)**

- `uStep = floor(uTime * BOIL_HZ)`(`BOIL_HZ ≈ 8`、時間を約8fpsに量子化)
- `offset = (hash(uv * k + uStep) - 0.5) * BOIL_AMP`(`BOIL_AMP ≈ 1.5テクセル`)
- この `offset` を Sobel の全サンプル位置に一律で加算(カーネルごとずらす)。ピクセル単位のノイズではなく、線全体が数コマに1回フルッと動く

**ハロー(明るい橋の写真でも線が見えるように)**

- エッジをより広い半径でも取って `haloMask` を作り(膨張)
- `rgb = mix(haloColor, lineColor, lineCore)`(`lineColor ≈ #eaf6ff` ほぼ白、`haloColor ≈ #0a1a2a` 暗い紺)
- `alpha = clamp(max(lineCore, haloMask * haloAlpha), 0, 1)`(`haloAlpha ≈ 0.5`)
- 白い線のまわりに暗いにじみが出て「発光する線画」になる。従来の `glowMaterial` の色設計を踏襲

**パラメータ**は `lineArtRenderer.ts` 冒頭に定数としてまとめ、実機で見ながら調整する(`glowMaterial.ts` の調整コメントと同じ運用)。

**海面クリッピングとの関係**: クリップされた切り口にも線が1本出る(体が海面と接する所に水平線が引かれる)。多くの場合「水面と体の境目」に見えて自然だが、不自然ならクリップ平面近傍でエッジ強度をフェードさせる余地を残す。

## データフロー(1フレーム)

1. `ArCameraView` の `renderer.setAnimationLoop` 内。`deltaSeconds` を計算
2. `getWhaleTransform(now - startedAt)` で位置・回転・`animationSpeed`・可視状態を取得し、`effectGroup` に適用(現行どおり)。可視なら swim mixer を `deltaSeconds * animationSpeed` で更新、海面クリッピング平面をワールド座標に更新
3. `lineArtRenderer.render(renderer, scene, camera)`:
   a. `rtNormal` にレンダーターゲットを切り替え、`scene.overrideMaterial = normalMaterial`、カメラを layer 1 のみ有効化して `renderer.render` → 法線 + 深度
   b. `overrideMaterial` を戻し、レンダーターゲットを画面に戻す
   c. エッジ検出 `ShaderMaterial` の uniform(`tNormal` / `tDepth` / `uStepTime` / `uResolution` 等)を更新し、全画面三角形を ortho カメラで `renderer.render` → 線画のクジラが画面に描かれる
4. `ArCameraView` がカメラを layer 0 のみ有効化して `renderer.render(scene, camera)`(clear せず上に重ねる) → スパークル・水しぶき
5. `markerUpdate`(水しぶきの発生判定・更新)を呼ぶ(現行どおり)
6. 撮影リクエストがあれば `captureComposite(video, renderer.domElement)`

## リスク・既知の懸念事項

- **SkinnedMesh 非ルート警告**: 整形後モデルの検証で `NODE_SKINNED_MESH_NON_ROOT` が出る。glTF仕様上、スキンドメッシュは親ノードの transform の影響を受けないとされる。three.js は実際には親のワールド行列を適用するため現行モデルでは軌道追従できているが、新モデルで初回描画時に「`effectGroup` の位置設定でクジラがベジェ軌道を動くか」を必ず確認する。動かない場合はロード時に SkinnedMesh とスケルトンのルートを制御下のグループへ再ペアレントする
- **モバイルの fill-rate**: 全画面のエッジ検出パスが1枚増える。クジラは小さいので許容範囲の見込みだが、実機で重い場合は `rtNormal` とエッジパスを 0.75× 解像度でレンダーしてアップスケールする。`rtNormal` のサイズは `min(devicePixelRatio, 2)` で上限を設ける
- **MindAR の renderer が WebGL2 か**: `DepthTexture` は WebGL2 前提(WebGL1 では `WEBGL_depth_texture` 拡張が必要)。three.js 0.160 は既定で WebGL2。起動時に `renderer.capabilities.isWebGL2` を確認する
- **`MeshNormalMaterial` のスキニング**: three.js 0.160 では SkinnedMesh に対して `MeshNormalMaterial` オーバーライドでもスキニングが適用される想定。初回描画で遊泳変形が法線バッファに反映されているかを確認する
- **エッジ検出方式の品質が実機で不足する場合**: 「シェーダー輪郭線(インバーテッドハル)+ 手描き内側ライン」方式に退避する(設計の「実現方式の選定理由」参照)
- **アニメーションのループ継ぎ目**: `Take 001` は開始値に戻る作りだが、完全にシームレスかは実機で確認。段差があれば `LoopRepeat` + わずかなクロスフェード、または先頭/末尾を詰める

## スコープ外

- 参考イラストにある環境演出(雨のような光の筋、音符、街のシルエット、人物)の再現。今回はクジラの見た目のみ
- クジラの演出そのものの変更(海の出入り・弧の軌道・休止ループは維持)
- `lineArtRenderer` を角島大橋以外の場所へ適用すること(汎用に作るが、利用は tsunoshima のみ)
- 現行モデル(`whale.glb`)の即時削除(新モデルの実機確認完了後に別途削除)
