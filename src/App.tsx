import { Suspense, lazy, useCallback, useState } from 'react'
import './App.css'

const ArCameraView = lazy(() =>
  import('./features/ar/ArCameraView').then((module) => ({ default: module.ArCameraView })),
)

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
          <Suspense fallback={<div className="camera-screen" />}>
            <ArCameraView onCapture={handleCapture} onClose={() => setState('idle')} onError={handleArError} />
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
