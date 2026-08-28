import { Suspense, lazy, useCallback, useState } from 'react'
import { getLocation } from './locations'
import type { LocationConfig } from './locations/types'
import { GuidancePage } from './pages/GuidancePage'
import { parseRoute } from './router'
import './App.css'

const ArCameraView = lazy(() =>
  import('./features/ar/ArCameraView').then((module) => ({ default: module.ArCameraView })),
)
const PersonDetectionCameraView = lazy(() =>
  import('./locations/yumetower/PersonDetectionCameraView').then((module) => ({
    default: module.PersonDetectionCameraView,
  })),
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
  const [location] = useState<LocationConfig | null>(() => resolveLocation(window.location.pathname))
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

        {state === 'camera' && location.cameraMode === 'image-target' && (
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

        {state === 'camera' && location.cameraMode === 'person-detection' && (
          <Suspense fallback={<div className="camera-screen" />}>
            <PersonDetectionCameraView
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
