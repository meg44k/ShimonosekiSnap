import { useEffect, useRef, useState, useCallback } from 'react'
import type { LocationConfig } from '../types'
import { detectPoseOnImage, getImagePoseLandmarker } from './poseTracker'
import katanaImgUrl from './katana_upright.png?url'

// 刀画像のサイズと柄の握り手アンカー座標 (katana_meta.json に準拠)
const KATANA_META = {
  width: 147,
  height: 1052,
  anchorX: 100,
  anchorY: 783,
}

interface GanryuCameraViewProps {
  location: LocationConfig
  onCapture: (photoDataUrl: string) => void
  onClose: () => void
  onError: (message: string) => void
}

export function GanryuCameraView({ onCapture, onClose, onError }: GanryuCameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const katanaImgRef = useRef<HTMLImageElement | null>(null)

  const [cameraReady, setCameraReady] = useState<boolean>(false)
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')

  // 刀画像のプリロード
  useEffect(() => {
    const img = new Image()
    img.src = katanaImgUrl
    img.onload = () => {
      katanaImgRef.current = img
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
      console.error('[GanryuCameraView] Camera access error:', err)
      onError('カメラを起動できませんでした。ブラウザの設定からカメラの使用を許可してください。')
      return null
    }
  }, [stopCamera, onError])

  useEffect(() => {
    startCamera(facingMode)
    // MediaPipe をバックグラウンドで先行ウォームアップ
    getImagePoseLandmarker().catch((err) => {
      console.warn('[GanryuCameraView] Landmarker warmup warning:', err)
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
   * シャッター押下時: 写真を撮影 ➔ 写真から手を検出し ➔ 刀画像を手に合成
   */
  const handleShutter = async () => {
    const video = videoRef.current
    if (!video || !cameraReady || isProcessing) return

    setIsProcessing(true)

    try {
      const isMirror = facingMode === 'user'
      const vw = video.videoWidth || 1280
      const vh = video.videoHeight || 720

      // 1) 高解像度写真のキャプチャ
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

      // 2) 撮影した写真から人物の手を検出
      const poses = await detectPoseOnImage(photoCanvas, vw, vh)

      // 3) 刀画像の準備
      let katanaImg = katanaImgRef.current
      if (!katanaImg) {
        katanaImg = new Image()
        katanaImg.src = katanaImgUrl
        await new Promise<void>((resolve, reject) => {
          katanaImg!.onload = () => resolve()
          katanaImg!.onerror = reject
        })
      }

      // 4) 手の検出結果に応じた刀の合成描画
      // 右手が検知されていれば右手、なければ左手、両方なければデフォルト位置
      const activeHand = poses.rightHand.detected
        ? poses.rightHand
        : poses.leftHand.detected
          ? poses.leftHand
          : null

      photoCtx.save()
      if (activeHand && activeHand.detected) {
        // 検出された手首/拳の位置に刀を合わせる
        photoCtx.translate(activeHand.pixelX, activeHand.pixelY)
        photoCtx.rotate(activeHand.angle)
        photoCtx.drawImage(
          katanaImg,
          -KATANA_META.anchorX * activeHand.scale,
          -KATANA_META.anchorY * activeHand.scale,
          KATANA_META.width * activeHand.scale,
          KATANA_META.height * activeHand.scale,
        )
      } else {
        // 人物が検知できなかった場合のデフォルト配置（画面右側）
        const defaultX = vw * 0.7
        const defaultY = vh * 0.65
        const defaultScale = (vh * 0.65) / KATANA_META.height
        photoCtx.translate(defaultX, defaultY)
        photoCtx.rotate(Math.PI / 12)
        photoCtx.drawImage(
          katanaImg,
          -KATANA_META.anchorX * defaultScale,
          -KATANA_META.anchorY * defaultScale,
          KATANA_META.width * defaultScale,
          KATANA_META.height * defaultScale,
        )
      }
      photoCtx.restore()

      const photoDataUrl = photoCanvas.toDataURL('image/png')
      onCapture(photoDataUrl)
    } catch (err) {
      console.error('[GanryuCameraView] Photo synthesis error:', err)
      onError('写真の撮影・刀の合成に失敗しました')
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
                ? '⚔️ 写真の手を検知して刀を持たせています...'
                : '📸 侍ポーズをして撮影ボタンを押してください'}
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
                borderTop: '4px solid #d4af37',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <p style={{ color: '#fff', fontSize: '15px', fontWeight: 'bold' }}>
              ⚔️ 写真の手を検出して刀を装着中...
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
