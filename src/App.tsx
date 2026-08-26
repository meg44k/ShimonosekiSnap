import { useRef, useState, useCallback, useEffect } from 'react'
import './App.css'

type AppState = 'idle' | 'camera' | 'preview'

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [state, setState] = useState<AppState>('idle')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const startCamera = useCallback(async (facing: 'user' | 'environment') => {
    setError(null)
    try {
      stopCamera()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setState('camera')
    } catch {
      setError('カメラへのアクセスが拒否されました。ブラウザの設定からカメラの使用を許可してください。')
      setState('idle')
    }
  }, [stopCamera])

  const takePhoto = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0)
    const url = canvas.toDataURL('image/png')
    setPhotoUrl(url)
    stopCamera()
    setState('preview')
  }, [stopCamera])

  const retake = useCallback(() => {
    setPhotoUrl(null)
    startCamera(facingMode)
  }, [startCamera, facingMode])

  const downloadPhoto = useCallback(() => {
    if (!photoUrl) return
    const link = document.createElement('a')
    link.href = photoUrl
    const now = new Date()
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
    link.download = `shimonoseki_snap_${timestamp}.png`
    link.click()
  }, [photoUrl])

  const switchCamera = useCallback(() => {
    const next = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(next)
    startCamera(next)
  }, [facingMode, startCamera])

  // コンポーネントのアンマウント時にカメラを停止
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

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
              onClick={() => startCamera(facingMode)}
            >
              カメラを起動
            </button>
          </div>
        )}

        {state === 'camera' && (
          <div className="camera-screen">
            <div className="video-container">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="camera-video"
              />
            </div>
            <div className="camera-controls">
              <button
                type="button"
                className="btn btn-icon"
                onClick={switchCamera}
                title="カメラ切り替え"
              >
                🔄
              </button>
              <button
                type="button"
                className="btn btn-shutter"
                onClick={takePhoto}
                title="撮影"
              >
                <span className="shutter-inner" />
              </button>
              <button
                type="button"
                className="btn btn-icon"
                onClick={() => {
                  stopCamera()
                  setState('idle')
                }}
                title="閉じる"
              >
                ✕
              </button>
            </div>
          </div>
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

        {/* 撮影用の非表示キャンバス */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </main>
    </div>
  )
}

export default App
