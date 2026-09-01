import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { savePhoto, saveVideo } from './features/ar/savePhoto'
import { getLocation } from './locations'
import type { LocationConfig } from './locations/types'
import { GuidancePage, MODEL_CREDIT } from './pages/GuidancePage'
import { navigate, parseRoute, useRoute } from './router'
import './App.css'

const ArCameraView = lazy(() =>
  import('./features/ar/ArCameraView').then((module) => ({ default: module.ArCameraView })),
)
const PersonDetectionCameraView = lazy(() =>
  import('./locations/yumetower/PersonDetectionCameraView').then((module) => ({
    default: module.PersonDetectionCameraView,
  })),
)

const KaikyokanCameraView = lazy(() =>
  import('./locations/kaikyokan/KaikyokanCameraView').then((module) => ({
    default: module.KaikyokanCameraView,
  })),
)

const GanryuCameraView = lazy(() =>
  import('./locations/ganryujima/GanryuCameraView').then((module) => ({
    default: module.GanryuCameraView,
  })),
)

const CompilePage = lazy(() =>
  import('./pages/CompilePage').then((module) => ({ default: module.CompilePage })),
)

type AppState = 'idle' | 'camera' | 'preview'

export function resolveLocation(pathname: string): LocationConfig | null {
  const route = parseRoute(pathname)
  if (route.type === 'spot') {
    return getLocation(route.id) ?? null
  }
  return null
}

function App() {
  const route = useRoute()
  const location = route.type === 'spot' ? getLocation(route.id) ?? null : null

  const [state, setState] = useState<AppState>('idle')
  const [capture, setCapture] = useState<{
    url: string
    kind: 'photo' | 'video'
    blob?: Blob
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const clearCapture = useCallback(() => {
    setCapture((prev) => {
      if (prev?.kind === 'video') URL.revokeObjectURL(prev.url)
      return null
    })
  }, [])

  // ルートまたはロケーションが変化したときにカメラ起動状態へ遷移
  useEffect(() => {
    setError(null)
    clearCapture()
    if (location) {
      setState('camera')
    } else {
      setState('idle')
    }
  }, [location, clearCapture])

  const handleCapture = useCallback(
    (url: string, kind: 'photo' | 'video' = 'photo', blob?: Blob) => {
      setCapture({ url, kind, blob })
      setState('preview')
    },
    [],
  )

  const handleArError = useCallback((message: string) => {
    setError(message)
    setState('idle')
  }, [])

  const retake = useCallback(() => {
    clearCapture()
    setError(null)
    setState('camera')
  }, [clearCapture])

  const saveCapture = useCallback(() => {
    if (!capture || !location) return
    const now = new Date()
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    const base = `shimonoseki_snap_${location.id}_${timestamp}`
    // モバイル(iOS Safari 等)は <a download> が効かないため、Web Share API で
    // OS の「写真に保存 / 共有」シートを開く。使えなければダウンロードに戻る。
    const done = (error: unknown) => console.error('[save] failed to save capture', error)
    if (capture.kind === 'video' && capture.blob) {
      const ext = capture.blob.type.includes('mp4') ? 'mp4' : 'webm'
      saveVideo(capture.blob, `${base}.${ext}`).catch(done)
    } else {
      savePhoto(capture.url, `${base}.png`).catch(done)
    }
  }, [capture, location])

  if (route.type === 'compile') {
    return (
      <div className="app">
        <header className="app-header">
          <h1 style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
            📸 ShimonosekiSnap
          </h1>
          <p className="subtitle">ARターゲットデータ生成ツール</p>
        </header>
        <main className="app-main">
          <Suspense fallback={<div className="start-screen"><p>読み込み中...</p></div>}>
            <CompilePage />
          </Suspense>
        </main>
      </div>
    )
  }

  if (!location) {
    return (
      <div className="app">
        <header className="app-header">
          <h1
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            📸 ShimonosekiSnap
          </h1>
          <p className="subtitle">下関の思い出を写真に残そう</p>
        </header>
        <main className="app-main">
          <GuidancePage />
        </main>
      </div>
    )
  }

  const locationIcon =
    location.id === 'kaikyokan'
      ? '🐧'
      : location.id === 'ganryujima'
        ? '⚔️'
        : location.id === 'akama'
          ? '⛩️'
          : location.id === 'yumetower'
            ? '🗼'
            : '🌊'

  return (
    <div className="app">
      {state !== 'camera' && state !== 'preview' && (
        <header className="app-header">
          <h1
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            📸 ShimonosekiSnap
          </h1>
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
            <div className="camera-icon">{locationIcon}</div>
            <h2>{location.name}</h2>
            <p>{location.guidanceText || `${location.name}にカメラを向けて撮影しましょう`}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '280px' }}>
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
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate('/')}
              >
                ← スポット一覧に戻る
              </button>
            </div>
            {location.id === 'tsunoshima' && <p className="model-credit">{MODEL_CREDIT}</p>}
          </div>
        )}

        {state === 'camera' && (
          <Suspense fallback={<div className="camera-screen" />}>
            {location.id === 'kaikyokan' ? (
              <KaikyokanCameraView
                key={location.id}
                location={location}
                onCapture={handleCapture}
                onClose={() => setState('idle')}
                onError={handleArError}
              />
            ) : location.id === 'ganryujima' ? (
              <GanryuCameraView
                key={location.id}
                location={location}
                onCapture={handleCapture}
                onClose={() => setState('idle')}
                onError={handleArError}
              />
            ) : location.cameraMode === 'person-detection' ? (
              <PersonDetectionCameraView
                key={location.id}
                location={location}
                onCapture={handleCapture}
                onClose={() => setState('idle')}
                onError={handleArError}
              />
            ) : (
              <ArCameraView
                key={location.id}
                location={location}
                onCapture={handleCapture}
                onClose={() => setState('idle')}
                onError={handleArError}
              />
            )}
          </Suspense>
        )}

        {state === 'preview' && capture && (
          <div className="preview-screen">
            <div className="photo-container">
              {capture.kind === 'video' ? (
                // 音声トラックは無い(canvas ストリーム録画)。短いループ再生で
                // カメラ画面と地続きな見た目にするため controls は出さない。
                <video
                  src={capture.url}
                  className="preview-photo"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              ) : (
                <img src={capture.url} alt="撮影した写真" className="preview-photo" />
              )}
            </div>
            <div className="preview-controls">
              <button type="button" className="btn btn-secondary" onClick={retake}>
                {capture.kind === 'video' ? '🎥 撮り直す' : '📷 撮り直す'}
              </button>
              <button type="button" className="btn btn-primary" onClick={saveCapture}>
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
