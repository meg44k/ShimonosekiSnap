import { useRef, useState, useCallback, useEffect } from 'react'
import biwaHoshiImg from './assets/biwa_hoshi.png'
import heikeNyokanImg from './assets/heike_nyokan.png'
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
  const [showQrModal, setShowQrModal] = useState<boolean>(false)

  // QRコードからアクセスされたか判定 (?spot=akama や ?camera=1 など)
  const [isFromQr, setIsFromQr] = useState<boolean>(false)

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
    } catch (err) {
      console.error('Camera access error:', err)
      setError('カメラの起動に失敗しました。ブラウザの設定でカメラへのアクセスを許可してください。')
      setState('idle')
    }
  }, [stopCamera])

  // QRコードから遷移してきた場合に自動でカメラ起動を試みる
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const spot = params.get('spot')
    const autoCamera = params.get('camera')

    if (spot === 'akama' || autoCamera === 'true' || autoCamera === '1' || spot !== null) {
      setIsFromQr(true)
      // モバイルブラウザでの自動起動を試行
      startCamera('environment').catch(() => {
        // ユーザー操作が必要な場合はidle画面で「カメラを起動」を押してもらう
        setState('idle')
      })
    }
  }, [startCamera])

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

    // 2) エフェクト画像を左右に合成（透過PNG）
    try {
      const [leftImg, rightImg] = await Promise.all([
        loadImage(biwaHoshiImg),
        loadImage(heikeNyokanImg),
      ])

      // エフェクトのサイズ: 写真の高さの38%を基準にアスペクト比を維持
      const effectHeight = vh * 0.38
      
      const leftScale = effectHeight / leftImg.naturalHeight
      const leftW = leftImg.naturalWidth * leftScale
      const leftH = effectHeight

      const rightScale = effectHeight / rightImg.naturalHeight
      const rightW = rightImg.naturalWidth * rightScale
      const rightH = effectHeight

      // 左下に琵琶法師
      ctx.drawImage(leftImg, 10, vh - leftH - 10, leftW, leftH)

      // 右下に平家の女官
      ctx.drawImage(rightImg, vw - rightW - 10, vh - rightH - 10, rightW, rightH)
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
    link.download = `akama_shrine_snap_${timestamp}.png`
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

  // テスト用QRコードURL（現在のURLに ?spot=akama を付与）
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : ''
  const spotUrl = `${currentOrigin}${currentPath}?spot=akama`
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(spotUrl)}`

  return (
    <div className="app">
      <header className="app-header">
        <div className="spot-badge">⛩️ スポット: 赤間神宮</div>
        <h1>赤間神宮 フォトスナップ</h1>
        <p className="subtitle">QRコード読み込み連動カメラ</p>
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
            <h2>赤間神宮限定フレーム</h2>
            <p>現地QRコード読取で自動起動、または下のボタンから開始できます</p>
            {isFromQr && (
              <div className="qr-detected-badge">
                ✨ QRコードを検知しました
              </div>
            )}
            <div className="effect-preview">
              <img src={biwaHoshiImg} alt="琵琶法師" className="effect-preview-img" />
              <span className="effect-preview-label">＋ あなたの写真 ＋</span>
              <img src={heikeNyokanImg} alt="平家女官" className="effect-preview-img" />
            </div>

            <div className="start-actions">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => startCamera(facingMode)}
              >
                📷 カメラを起動する
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowQrModal(true)}
              >
                📱 現地用QRコードを確認
              </button>
            </div>
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
              {/* カメラプレビュー上の左右エフェクトオーバーレイ */}
              <img
                src={biwaHoshiImg}
                alt="琵琶法師"
                className="overlay overlay-left"
              />
              <img
                src={heikeNyokanImg}
                alt="平家女官"
                className="overlay overlay-right"
              />
            </div>
            <div className="camera-controls">
              <button
                type="button"
                className="btn btn-icon"
                onClick={switchCamera}
                title="イン/アウトカメラ切り替え"
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
                title="終了"
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
                💾 写真を保存
              </button>
            </div>
          </div>
        )}

        {/* QRコード確認モーダル */}
        {showQrModal && (
          <div className="modal-backdrop" onClick={() => setShowQrModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>📱 赤間神宮 QRコード</h3>
              <p className="modal-desc">スマホのカメラで読み取ると、直接このカメラ画面が起動します。</p>
              <div className="qr-container">
                <img src={qrApiUrl} alt="赤間神宮 QRコード" className="qr-image" />
              </div>
              <div className="qr-url-box">
                <code>{spotUrl}</code>
              </div>
              <button
                type="button"
                className="btn btn-secondary modal-close-btn"
                onClick={() => setShowQrModal(false)}
              >
                閉じる
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
