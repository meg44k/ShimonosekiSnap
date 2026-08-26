import { useRef, useState, useCallback, useEffect } from 'react'
import biwaHoshiImg from './assets/biwa_hoshi.png'
import heikNyokanImg from './assets/heike_nyokan.jpg'
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

  /** 画像を読み込んでPromiseで返すヘルパー */
  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
  }

  /** 撮影してエフェクト（左右の画像）を合成 */
  const takePhoto = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const vw = video.videoWidth
    const vh = video.videoHeight
    canvas.width = vw
    canvas.height = vh
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 1) カメラ映像を描画
    ctx.drawImage(video, 0, 0, vw, vh)

    // 2) エフェクト画像を左右に合成
    try {
      const [leftImg, rightImg] = await Promise.all([
        loadImage(biwaHoshiImg),
        loadImage(heikNyokanImg),
      ])

      // エフェクトのサイズ: 写真の高さの40%を基準にアスペクト比を維持
      const effectHeight = vh * 0.4
      const leftScale = effectHeight / leftImg.naturalHeight
      const leftW = leftImg.naturalWidth * leftScale
      const leftH = effectHeight

      const rightScale = effectHeight / rightImg.naturalHeight
      const rightW = rightImg.naturalWidth * rightScale
      const rightH = effectHeight

      // 左下に琵琶法師
      ctx.drawImage(leftImg, 0, vh - leftH, leftW, leftH)

      // 右下に女官
      ctx.drawImage(rightImg, vw - rightW, vh - rightH, rightW, rightH)
    } catch (e) {
      console.warn('エフェクト画像の合成に失敗しました:', e)
    }

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
    link.download = `akama_shrine_${timestamp}.png`
    link.click()
  }, [photoUrl])

  const switchCamera = useCallback(() => {
    const next = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(next)
    startCamera(next)
  }, [facingMode, startCamera])

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  return (
    <div className="app">
      <header className="app-header">
        <h1>⛩️ 赤間神宮 フォトスナップ</h1>
        <p className="subtitle">赤間神宮で思い出の一枚を撮ろう</p>
      </header>

      <main className="app-main">
        {error && (
          <div className="error-message">
            <p>⚠️ {error}</p>
          </div>
        )}

        {state === 'idle' && (
          <div className="start-screen">
            <div className="camera-icon">⛩️</div>
            <p>カメラを起動して赤間神宮で写真を撮影しましょう</p>
            <p className="effect-hint">📸 撮影すると平家ゆかりのエフェクトが付きます</p>
            <div className="effect-preview">
              <img src={biwaHoshiImg} alt="琵琶法師" className="effect-preview-img" />
              <span className="effect-preview-label">＋ あなたの写真 ＋</span>
              <img src={heikNyokanImg} alt="平家の女官" className="effect-preview-img" />
            </div>
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
              {/* カメラプレビュー上にエフェクトのオーバーレイを表示 */}
              <img
                src={biwaHoshiImg}
                alt=""
                className="overlay overlay-left"
              />
              <img
                src={heikNyokanImg}
                alt=""
                className="overlay overlay-right"
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

        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </main>
    </div>
  )
}

export default App
