// TF.js のモデル(重み)をアプリに同梱するためのダウンローダ。
// 既定では tfhub.dev(→ storage.googleapis.com へリダイレクト)から実行時に
// 取得しており、会場の回線・Google への到達性に左右される。ここで一度落として
// public/models/ に置き、Vercel のエッジ CDN から immutable キャッシュで配る。
//
// 使い方: node scripts/fetch-models.mjs
// tfhub の「モデルディレクトリ URL + ?tfjs-format=file」で model.json を取り、
// weightsManifest の shard 群も同じ場所から取得する。

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'models')

// キー = public/models/<キー>/ 配下に保存。値 = tfhub のモデルディレクトリ URL。
// URL は node_modules の各パッケージの constants.js の既定値に合わせている。
const MODELS = {
  // @tensorflow-models/face-detection (short range) … FaceMesh の顔検出段
  'face-detector-short': 'https://tfhub.dev/mediapipe/tfjs-model/face_detection/short/1',
  // @tensorflow-models/face-landmarks-detection (tfjs runtime)
  'face-mesh': 'https://tfhub.dev/mediapipe/tfjs-model/face_landmarks_detection/face_mesh/1',
  // @tensorflow-models/pose-detection MoveNet
  'movenet-singlepose-lightning':
    'https://tfhub.dev/google/tfjs-model/movenet/singlepose/lightning/4',
  'movenet-multipose-lightning':
    'https://tfhub.dev/google/tfjs-model/movenet/multipose/lightning/1',
}

async function fetchOk(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res
}

for (const [name, base] of Object.entries(MODELS)) {
  const dir = join(OUT_DIR, name)
  await mkdir(dir, { recursive: true })

  const modelJson = await (await fetchOk(`${base}/model.json?tfjs-format=file`)).json()
  await writeFile(join(dir, 'model.json'), JSON.stringify(modelJson))

  const shardPaths = new Set()
  for (const group of modelJson.weightsManifest ?? []) {
    for (const path of group.paths ?? []) shardPaths.add(path)
  }

  let bytes = 0
  for (const path of shardPaths) {
    const buf = Buffer.from(await (await fetchOk(`${base}/${path}?tfjs-format=file`)).arrayBuffer())
    await writeFile(join(dir, path), buf)
    bytes += buf.length
  }
  console.log(`${name}: model.json + ${shardPaths.size} shard(s), ${(bytes / 1024 / 1024).toFixed(2)} MB`)
}

console.log('done → public/models/')
