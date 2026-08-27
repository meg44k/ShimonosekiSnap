# 複数場所対応(フレームワーク) 設計書

- 日付: 2026-08-27
- 対象プロジェクト: shimonoseki-snap (React + TypeScript + Vite)
- 前提: `docs/superpowers/specs/2026-08-26-ar-whale-effect-design.md`(角島大橋+クジラのARエフェクト)の実装が完了していること

## 背景 / 目的

このアプリを複数の観光地に展開する計画があり、各地点にQRコードを設置する。QRコードを読み取るとその場所専用のARカメラ画面に直接遷移し、場所ごとに異なるARエフェクト(対象画像・3Dモデル・アニメーション)を表示できるようにしたい。

現状の実装は「角島大橋の写真 → クジラのエフェクト」の組み合わせが`ArCameraView`コンポーネントに直接ハードコードされている。これを一般化し、場所を追加しやすい仕組み(フレームワーク)を作る。

## 要件

- 場所ごとに固有のURL(`/spot/:id`)を持ち、QRコードはこのURLを直接指す
- QRコード経由で場所のURLに到着すると、ページ表示と同時に自動でカメラが起動する(ボタンタップ不要)
- 場所ごとに異なるARターゲット画像(`.mind`ファイル)・異なる3Dモデル・異なるアニメーションを設定できる
- 存在しない場所ID、または場所を指定しないURL(`/`)にアクセスした場合は「QRコードを読み取ってください」という案内画面を表示する(テスト用に既知の場所一覧へのリンクも表示する)
- カメラ画面で閉じる(✕)を押した場合は、その場所名を表示した待機画面(再度「カメラを起動」できるボタン付き)に戻る
- 撮影・プレビュー・保存・撮り直しの既存フローはそのまま維持する。保存ファイル名に場所IDを含める

## スコープ

- 今回作るのは複数場所対応の**仕組み(フレームワーク)**のみ。既存の「角島大橋+クジラ」をこの仕組みの1つ目の場所として移行する
- QRコード画像自体の生成・印刷は対象外(URL構造にだけ対応すればよい)
- 新しい場所の追加(新しい対象写真・3Dモデル・アニメーションの用意)は今回のスコープ外。将来、場所を追加する際は`src/locations/`配下に新しいディレクトリを追加するだけで済む構成にする

## 技術選定: ルーティング

`window.location.pathname`とHistory APIを使った自前の軽量フックで対応する。`react-router-dom`等のライブラリは導入しない。

必要なルートパターンは`/`と`/spot/:id`の2種類のみで、ネストしたルーティングや複雑な機能は不要なため、専用ライブラリを追加するのはYAGNIに反する。

## アーキテクチャ

### 新規ファイル

| ファイル | 役割 |
| --- | --- |
| `src/locations/types.ts` | `ArEffect`(`loadModel`/`getTransform`)と`LocationConfig`(`id`/`name`/`guidanceText`/`targetSrc`/`effect`)の型定義 |
| `src/locations/tsunoshima/index.ts` | 角島大橋の`LocationConfig`を組み立てて公開 |
| `src/locations/tsunoshima/whaleAnimation.ts` | (移動)既存の`src/features/ar/whaleAnimation.ts`をそのまま移動 |
| `src/locations/tsunoshima/whaleAnimation.test.ts` | (移動)既存のテストをそのまま移動 |
| `src/locations/tsunoshima/loadWhaleModel.ts` | (移動)既存の`src/features/ar/loadWhaleModel.ts`をそのまま移動(`whale.glb`への相対パスを更新) |
| `src/locations/index.ts` | 場所IDから`LocationConfig`を引くレジストリ(`getLocation(id)`、`listLocations()`) |
| `src/router.ts` | `window.location.pathname`を`{ type: 'root' } \| { type: 'spot', id: string }`に解釈するカスタムフック(`popstate`購読、`navigate(path)`関数を提供) |
| `src/pages/GuidancePage.tsx` | `/`または未知の場所IDでの案内画面(「QRコードを読み取ってください」+場所一覧リンク) |

### 移動するファイル(パスのみ変更、中身は不変)

- `src/assets/models/whale.glb` → `src/locations/tsunoshima/whale.glb`

### 既存ファイルへの変更

- `src/features/ar/ArCameraView.tsx`: クジラ専用の実装(`loadWhaleModel`/`getWhaleTransform`/`WHALE_TARGET_SRC`相当のハードコード)を削除し、`location: LocationConfig`propを受け取って`location.targetSrc`/`location.guidanceText`/`location.effect.loadModel()`/`location.effect.getTransform()`を使う一般化した実装にする
- `src/App.tsx`: `src/router.ts`のフックを使い、`/spot/:id`が既知の場所ならその場所の`camera`状態で初期化して起動、未知のIDや`/`では`GuidancePage`を表示する。カメラを閉じたときの待機画面に場所名を表示する
- `public/targets/tunoshima.mind`: パスは変更しない(既に場所IDに沿った命名のため)

## データフロー

1. ページ読み込み時、`src/router.ts`が`window.location.pathname`を解析する
2. `/spot/tsunoshima`のように既知の場所IDであれば、`src/locations/index.ts`から対応する`LocationConfig`を取得し、アプリの状態を最初から`camera`(その場所)で初期化する。ユーザー操作なしで`ArCameraView`がマウントされ、カメラ権限ダイアログが表示される
3. 存在しない場所IDまたは`/`の場合は`GuidancePage`を表示する。この画面には「QRコードを読み取ってください」という案内文と、動作確認用に既存の場所一覧(現状は角島大橋のみ)へのリンクを表示する
4. `ArCameraView`はpropで渡された`LocationConfig`の`targetSrc`(`.mind`ファイルのパス)・`guidanceText`(スキャン中の案内文)・`effect`(`loadModel`/`getTransform`)を使ってMindARとThree.jsを初期化する。実装の中身(MindARの初期化、撮影合成、エラー処理等)は既存のまま変更しない
5. カメラ画面で✕を押すと、その場所の待機画面(場所名 + 「カメラを起動」ボタン)に戻る。ここで再度ボタンを押すと同じ場所のカメラが起動する
6. 撮影 → プレビュー → 保存の流れは既存のまま。保存ファイル名は`shimonoseki_snap_${location.id}_${timestamp}.png`とする

## 移行(既存クジラ実装の一般化)

既存の`whaleAnimation.ts`(`WhaleTransform`/`CYCLE_DURATION_MS`/`HIDDEN_TRANSFORM`/`getWhaleTransform`)と`loadWhaleModel.ts`(`loadWhaleModel(): Promise<THREE.Group>`)は、そのまま`ArEffect`インターフェースを満たす形になっている(型定義を`src/locations/types.ts`に切り出し、`whaleAnimation.ts`側は`WhaleTransform`ではなく共通の`ArTransform`型を使うよう変更する程度)。ロジックの変更は行わず、ファイルの移動と型の一般化のみ行う。

## リスク・既知の懸念事項

- `ArCameraView`の`useEffect`は現状`[onError]`にのみ依存しているが、`location`(ターゲット画像やエフェクト)が変わった場合も再初期化が必要になる。同一セッション内でクライアントサイド遷移により場所を切り替えるケースは今回想定していない(QRコード経由の新規ページ読み込みが前提)が、念のため`<ArCameraView key={location.id} .../>`のように`key`を指定し、場所が変わった場合は確実に再マウントされるようにする
- カメラ自動起動はページ読み込み直後にブラウザのカメラ権限ダイアログを表示するため、ユーザーが意図せずページに来た場合(QR以外の経路)でも権限を求められる。今回はQRコード経由のアクセスを前提とするため許容する

## スコープ外

- QRコード画像の生成・印刷
- 角島大橋以外の新しい場所の具体的なコンテンツ(対象写真・3Dモデル・アニメーション)の追加
- 場所の管理画面・CMS的な仕組み(場所は静的なコード上のレジストリで管理する)
