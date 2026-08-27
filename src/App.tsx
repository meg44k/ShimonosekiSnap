import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { getLocation } from './locations'
import type { LocationConfig } from './locations/types'
import { CompilePage } from './pages/CompilePage'
import { GuidancePage } from './pages/GuidancePage'
import { navigate, parseRoute, useRoute } from './router'
import './App.css'

const ArCameraView = lazy(() =>
  import('./features/ar/ArCameraView').then((module) => ({ default: module.ArCameraView })),
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
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ルートまたはロケーションが変化したときにカメラ起動状態へ遷移
  useEffect(() => {
    setError(null)
    setPhotoUrl(null)
    if (location) {
      setState('camera')
    } else {
      setState('idle')
    }
  }, [location])

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
          <CompilePage />
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

  return (
    <div className="app">
      {state !== 'camera' && (
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
            <div className="camera-icon">⛩️</div>
            <h2>{location.name}</h2>
            <p>{location.guidanceText}</p>
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
