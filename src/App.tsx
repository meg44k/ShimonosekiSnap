import { useRef, useState, useCallback, useEffect } from 'react'
import hoichiImg from './assets/miminashi_hoichi.png'
import antokuImg from './assets/antoku_tenno.png'
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
  const [isCapturing, setIsCapturing] = useState<boolean>(false)

  // QRコードからアクセスされたか判定
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
      startCamera('environment').catch(() => {
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

  /** 写真を撮影し、耳なし芳一と安徳天皇を同じ大きさ・大きめサイズで自動合成 */
  const takePhoto = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || isCapturing) return

    setIsCapturing(true)
    const vw = video.videoWidth
    const vh = video.videoHeight
    canvas.width = vw
    canvas.height = vh
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setIsCapturing(false)
      return
    }

    // 1) 撮影時のカメラ映像を描画
    ctx.drawImage(video, 0, 0, vw, vh)

    // 2) 撮影後の写真に「耳なし芳一」と「安徳天皇」をサイズを揃えて大きく合成
    try {
      const [leftImg, rightImg] = await Promise.all([
        loadImage(hoichiImg),
        loadImage(antokuImg),
      ])

      // 写真の高さの45%（横幅の38%上限）を基準に両者の高さを統一
      const targetHeight = Math.min(vh * 0.46, vw * 0.38)
      const margin = Math.max(12, Math.round(vh * 0.02))

      // 左下: 耳なし芳一
      const leftScale = targetHeight / leftImg.naturalHeight
      const leftW = leftImg.naturalWidth * leftScale
      const leftH = targetHeight
      ctx.drawImage(leftImg, margin, vh - leftH - margin, leftW, leftH)

      // 右下: 安徳天皇
      const rightScale = targetHeight / rightImg.naturalHeight
      const rightW = rightImg.naturalWidth * rightScale
      const rightH = targetHeight
      ctx.drawImage(rightImg, vw - rightW - margin, vh - rightH - margin, rightW, rightH)
    } catch (e) {
      console.warn('キャラクター画像の合成に失敗しました:', e)
    }

    const url = canvas.toDataURL('image/png')
    setPhotoUrl(url)
    stopCamera()
    setIsCapturing(false)
    setState('preview')
  }, [stopCamera, isCapturing])

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
    link.download = `akama_snap_hoichi_antoku_${timestamp}.png`
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

  // テスト用QRコードURL
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : ''
  const spotUrl = `${currentOrigin}${currentPath}?spot=akama`
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(spotUrl)}`

  return (
    <div className="app">
      <header className="app-header">
        <div className="spot-badge">⛩️ 赤間神宮 スポット</div>
        <h1>赤間神宮 スナップ</h1>
        <p className="subtitle">撮影すると写真の中に歴史上の人物が現れます</p>
      </header>

      <main className="app-main">
        {error && (
          <div className="error-message">
            <p>⚠️ {error}</p>
          </div>
        )}

        {/* スタート画面 */}
        {state === 'idle' && (
          <div className="start-screen">
            <div className="camera-icon">⛩️</div>
            <h2>赤間神宮限定カメラ</h2>
            <p>写真を撮影すると、写真の中に<strong>「耳なし芳一」</strong>と<strong>「安徳天皇」</strong>が自動で登場します！</p>
            {isFromQr && (
              <div className="qr-detected-badge">
                ✨ QRコードからアクセス中
              </div>
            )}

            <div className="character-preview-card">
              <p className="character-card-title">✨ 写真に登場する人物</p>
              <div className="character-pair">
                <div className="character-item">
                  <img src={hoichiImg} alt="耳なし芳一" className="character-thumb" />
                  <span className="character-name">耳なし芳一</span>
                </div>
                <div className="character-plus">×</div>
                <div className="character-item">
                  <img src={antokuImg} alt="安徳天皇" className="character-thumb" />
                  <span className="character-name">安徳天皇</span>
                </div>
              </div>
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

        {/* カメラ撮影画面 */}
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
              <div className="camera-viewfinder-guide">
                <span className="guide-text">📸 撮影すると二人が現れます</span>
              </div>
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
                disabled={isCapturing}
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

        {/* 撮影後プレビュー画面 */}
        {state === 'preview' && photoUrl && (
          <div className="preview-screen">
            <div className="reveal-badge">
              ✨ 耳なし芳一 と 安徳天皇 が現れました！
            </div>
            <div className="photo-container">
              <img src={photoUrl} alt="撮影した写真（耳なし芳一・安徳天皇）" className="preview-photo" />
            </div>
            <div className="preview-controls">
              <button type="button" className="btn btn-secondary" onClick={retake}>
                📷 もう一度撮る
              </button>
              <button type="button" className="btn btn-primary" onClick={downloadPhoto}>
                💾 写真を保存
              </button>
            </div>
          </div>
        )}

        {/* QRコードモーダル */}
        {showQrModal && (
          <div className="modal-backdrop" onClick={() => setShowQrModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>📱 赤間神宮 現地QRコード</h3>
              <p className="modal-desc">スマホで読み取ると、直接このカメラ画面が起動します。</p>
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
