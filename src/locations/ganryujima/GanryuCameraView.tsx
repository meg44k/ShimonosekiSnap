import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import type { LocationConfig } from '../types'
import { loadKatanaModel, type KatanaType } from './loadKatanaModel'
import { detectPoseOnImage, getImagePoseLandmarker } from './poseTracker'

interface GanryuCameraViewProps {
  location: LocationConfig
  onCapture: (photoDataUrl: string) => void
  onClose: () => void
  onError: (message: string) => void
}

type StanceMode = 'auto' | 'right' | 'left' | 'dual'

export function GanryuCameraView({ onCapture, onClose, onError }: GanryuCameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [cameraReady, setCameraReady] = useState<boolean>(false)
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [stanceMode, setStanceMode] = useState<StanceMode>('auto')
  const [katanaType, setKatanaType] = useState<KatanaType>('standard')

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
    // AIモデルをバックグラウンドで先行ウォームアップ
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
   * シャッター押下時: 写真を撮影 ➔ 写真から手を検出し ➔ 3D刀を持たせて合成
   */
  const handleShutter = async () => {
    const video = videoRef.current
    if (!video || !cameraReady || isProcessing) return

    setIsProcessing(true)

    try {
      const isMirror = facingMode === 'user'
      const vw = video.videoWidth || 1280
      const vh = video.videoHeight || 720

      // 1) 写真のキャプチャ（高解像度 Canvas）
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

      // 2) 撮影した写真から人物の手の位置とポーズを検出
      const poses = await detectPoseOnImage(photoCanvas, vw, vh)

      // 3) 刀モデルをロードして Three.js シーンに配置
      const isDual = stanceMode === 'dual'
      const rightType = isDual ? 'standard' : katanaType
      const leftType = isDual ? 'wakizashi' : katanaType

      const [rightModel, leftModel] = await Promise.all([
        loadKatanaModel(rightType),
        loadKatanaModel(leftType),
      ])

      const scene = new THREE.Scene()
      const aspect = vw / vh
      const camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 100)
      camera.position.set(0, 0, 10)
      camera.lookAt(0, 0, 0)

      // ライティング
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.8)
      scene.add(ambientLight)

      const hemiLight = new THREE.HemisphereLight(0xffffff, 0x555555, 1.4)
      hemiLight.position.set(0, 20, 0)
      scene.add(hemiLight)

      const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.8)
      dirLight1.position.set(5, 10, 8)
      scene.add(dirLight1)

      const dirLight2 = new THREE.DirectionalLight(0xd4af37, 1.8)
      dirLight2.position.set(-5, 5, -5)
      scene.add(dirLight2)

      const showRight =
        stanceMode === 'dual' ||
        stanceMode === 'right' ||
        (stanceMode === 'auto' && (poses.rightHand.detected || !poses.leftHand.detected))

      const showLeft =
        stanceMode === 'dual' ||
        stanceMode === 'left' ||
        (stanceMode === 'auto' && poses.leftHand.detected && !poses.rightHand.detected)

      // 右手への刀配置
      if (showRight) {
        const rightGroup = new THREE.Group()
        rightGroup.add(rightModel)
        rightGroup.position.set(poses.rightHand.threeX, poses.rightHand.threeY, 2)
        rightGroup.rotation.z = poses.rightHand.angle
        const sc = poses.rightHand.scale * 1.05
        rightGroup.scale.set(sc, sc, sc)
        scene.add(rightGroup)
      }

      // 左手への刀配置
      if (showLeft) {
        const leftGroup = new THREE.Group()
        leftGroup.add(leftModel)
        leftGroup.position.set(poses.leftHand.threeX, poses.leftHand.threeY, 2)
        leftGroup.rotation.z = poses.leftHand.angle
        const sc = poses.leftHand.scale * 1.05
        leftGroup.scale.set(-sc, sc, sc)
        scene.add(leftGroup)
      }

      // 4) Three.js で刀レイヤーをオフスクリーン描画
      const renderCanvas = document.createElement('canvas')
      renderCanvas.width = vw
      renderCanvas.height = vh
      const renderer = new THREE.WebGLRenderer({
        canvas: renderCanvas,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      })
      renderer.setPixelRatio(1)
      renderer.setSize(vw, vh)
      renderer.render(scene, camera)

      // 5) 写真と3D刀を合成
      photoCtx.drawImage(renderCanvas, 0, 0, vw, vh)

      const photoDataUrl = photoCanvas.toDataURL('image/png')
      renderer.dispose()

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
        <div className="camera-viewfinder-guide" style={{ top: '14px' }}>
          <span className="guide-text">
            {!cameraReady
              ? '📷 カメラを起動中...'
              : isProcessing
                ? '⚔️ 写真の手を検知して刀を持たせています...'
                : '📸 構えるポーズをして撮影ボタンを押してください'}
          </span>
        </div>

        {/* 刀の種類 & 構え切替ツールバー */}
        <div
          style={{
            position: 'absolute',
            top: '56px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            zIndex: 5,
            width: '90%',
            maxWidth: '420px',
          }}
        >
          {/* 刀の選択 */}
          <div
            style={{
              display: 'flex',
              gap: '4px',
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(8px)',
              padding: '4px 8px',
              borderRadius: '999px',
            }}
          >
            <button
              type="button"
              className={`btn ${katanaType === 'standard' && stanceMode !== 'dual' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '999px' }}
              onClick={() => {
                setKatanaType('standard')
                if (stanceMode === 'dual') setStanceMode('auto')
              }}
            >
              武蔵の打刀
            </button>
            <button
              type="button"
              className={`btn ${katanaType === 'nodachi' && stanceMode !== 'dual' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '999px' }}
              onClick={() => {
                setKatanaType('nodachi')
                if (stanceMode === 'dual') setStanceMode('auto')
              }}
            >
              小次郎の物干し竿
            </button>
            <button
              type="button"
              className={`btn ${stanceMode === 'dual' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '999px' }}
              onClick={() => setStanceMode('dual')}
            >
              二刀流 ⚔️⚔️
            </button>
          </div>

          {/* 構えの手（二刀流以外） */}
          {stanceMode !== 'dual' && (
            <div
              style={{
                display: 'flex',
                gap: '4px',
                background: 'rgba(0,0,0,0.5)',
                padding: '3px 6px',
                borderRadius: '999px',
              }}
            >
              <button
                type="button"
                className={`btn ${stanceMode === 'auto' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '2px 8px', fontSize: '10px', borderRadius: '999px' }}
                onClick={() => setStanceMode('auto')}
              >
                自動判定
              </button>
              <button
                type="button"
                className={`btn ${stanceMode === 'right' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '2px 8px', fontSize: '10px', borderRadius: '999px' }}
                onClick={() => setStanceMode('right')}
              >
                右手
              </button>
              <button
                type="button"
                className={`btn ${stanceMode === 'left' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '2px 8px', fontSize: '10px', borderRadius: '999px' }}
                onClick={() => setStanceMode('left')}
              >
                左手
              </button>
            </div>
          )}
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
