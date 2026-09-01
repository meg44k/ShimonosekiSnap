import { useEffect, useRef, useState, useCallback } from 'react'
import type { LocationConfig } from '../types'
import { detectPoseOnImage, getImagePoseLandmarker } from './poseTracker'
import penguinImgUrl from './penguin.png'

// ペンギン画像のサイズと足元アンカー座標 (下端中央: 320, 660)
const PENGUIN_META = {
  width: 640,
  height: 667,
  anchorX: 320,
  anchorY: 660,
}

interface KaikyokanCameraViewProps {
  location: LocationConfig
  onCapture: (photoDataUrl: string) => void
  onClose: () => void
  onError: (message: string) => void
}

export function KaikyokanCameraView({ onCapture, onClose, onError }: KaikyokanCameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const penguinImgRef = useRef<HTMLImageElement | null>(null)

  const [cameraReady, setCameraReady] = useState<boolean>(false)
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')

  // ペンギン画像のプリロード
  useEffect(() => {
    const img = new Image()
    img.src = penguinImgUrl
    img.onload = () => {
      penguinImgRef.current = img
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const startCamera = useCallback(async (facing: 'user' | 'environment') => {
    try {
      stopCamera()
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        video.onloadedmetadata = () => {
          video
            .play()
            .then(() => setCameraReady(true))
            .catch(() => setCameraReady(true))
        }
      }
      return stream
    } catch (err) {
      console.error('[KaikyokanCameraView] Camera access error:', err)
      onError('カメラを起動できませんでした。ブラウザの設定からカメラの使用を許可してください。')
      return null
    }
  }, [stopCamera, onError])

  useEffect(() => {
    startCamera(facingMode)
    getImagePoseLandmarker().catch((err) => {
      console.warn('[KaikyokanCameraView] Landmarker warmup warning:', err)
    })

    return () => {
      stopCamera()
    }
  }, [facingMode, startCamera, stopCamera])

  const handleSwitchCamera = () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(nextFacing)
  }

  /**
   * シャッター押下時: 写真を撮影 ➔ 手のひらを検出 ➔ ペンギンを乗せて合成
   */
  const handleShutter = async () => {
    const video = videoRef.current
    if (!video || !cameraReady || isProcessing) return

    setIsProcessing(true)

    try {
      const isMirror = facingMode === 'user'
      const vw = video.videoWidth || 1280
      const vh = video.videoHeight || 720

      // 1) 写真のキャプチャ
      const photoCanvas = document.createElement('canvas')
      photoCanvas.width = vw
      photoCanvas.height = vh
      const photoCtx = photoCanvas.getContext('2d')
      if (!photoCtx) throw new Error('2D context not available')

      photoCtx.save()
      if (isMirror) {
        photoCtx.translate(vw, 0)
        photoCtx.scale(-1, 1)
      }
      photoCtx.drawImage(video, 0, 0, vw, vh)
      photoCtx.restore()

      // 2) 写真から人物の手のひらを検出
      const poses = await detectPoseOnImage(photoCanvas, vw, vh)

      // 3) ペンギン画像の準備
      let penguinImg = penguinImgRef.current
      if (!penguinImg) {
        penguinImg = new Image()
        penguinImg.src = penguinImgUrl
        await new Promise<void>((resolve, reject) => {
          penguinImg!.onload = () => resolve()
          penguinImg!.onerror = reject
        })
      }

      // 4) 検出された手のひらの上にペンギンを描画（大きめに表示）
      const activeHand = poses.rightHand.detected
        ? poses.rightHand
        : poses.leftHand.detected
          ? poses.leftHand
          : null

      photoCtx.save()
      if (activeHand && activeHand.detected) {
        // ペンギンのスケール: 存在感のある大きめサイズ（手のひらの上にしっかり立つ）
        const penguinScale = Math.max(0.4, Math.min(2.0, activeHand.scale * 0.9))
        
        // 手のひらの位置 (pixelX, pixelY) にペンギンの足元 (anchorX, anchorY) を配置
        photoCtx.translate(activeHand.pixelX, activeHand.pixelY)
        
        // わずかに直立（手のひらの傾きに少しだけ寄り添う）
        const tiltAngle = activeHand.angle * 0.15
        photoCtx.rotate(tiltAngle)
        
        photoCtx.drawImage(
          penguinImg,
          -PENGUIN_META.anchorX * penguinScale,
          -PENGUIN_META.anchorY * penguinScale,
          PENGUIN_META.width * penguinScale,
          PENGUIN_META.height * penguinScale,
        )
      } else {
        // 人物が検知できなかった場合のデフォルト配置（画面中央下側・大きめ）
        const defaultX = vw * 0.5
        const defaultY = vh * 0.75
        const defaultScale = (vh * 0.55) / PENGUIN_META.height
        
        photoCtx.translate(defaultX, defaultY)
        photoCtx.drawImage(
          penguinImg,
          -PENGUIN_META.anchorX * defaultScale,
          -PENGUIN_META.anchorY * defaultScale,
          PENGUIN_META.width * defaultScale,
          PENGUIN_META.height * defaultScale,
        )
      }
      photoCtx.restore()

      const photoDataUrl = photoCanvas.toDataURL('image/png')
      onCapture(photoDataUrl)
    } catch (err) {
      console.error('[KaikyokanCameraView] Photo synthesis error:', err)
      onError('写真の撮影・ペンギンの合成に失敗しました')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="camera-screen">
      <div
        className="video-container"
        style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
      >
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className="camera-video"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
          }}
        />

        {/* ガイダンスバッジ */}
        <div className="camera-viewfinder-guide" style={{ top: '16px' }}>
          <span className="guide-text">
            {!cameraReady
              ? '📷 カメラを起動中...'
              : isProcessing
                ? '🐧 手のひらを検出してペンギンを乗せています...'
                : '📸 手のひらを上にしてみてね'}
          </span>
        </div>

        {/* 処理中のローディングインジケーター */}
        {isProcessing && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.75)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              gap: '16px',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                border: '4px solid rgba(255, 255, 255, 0.2)',
                borderTop: '4px solid #38bdf8',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <p style={{ color: '#fff', fontSize: '15px', fontWeight: 'bold' }}>
              🐧 手のひらの上にペンギンを乗せています...
            </p>
          </div>
        )}
      </div>

      <div className="camera-controls">
        <button
          type="button"
          className="btn btn-icon"
          onClick={handleSwitchCamera}
          disabled={isProcessing}
          title="イン/アウトカメラ切り替え"
        >
          🔄
        </button>
        <button
          type="button"
          className="btn btn-shutter"
          onClick={handleShutter}
          disabled={!cameraReady || isProcessing}
          title="撮影"
        >
          <span className="shutter-inner" />
        </button>
        <button type="button" className="btn btn-icon" onClick={onClose} title="閉じる">
          ✕
        </button>
      </div>
    </div>
  )
}
