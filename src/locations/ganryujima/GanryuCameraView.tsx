import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { captureComposite } from '../../features/ar/captureComposite'
import type { LocationConfig } from '../types'
import { loadKatanaModel } from './loadKatanaModel'
import { getPoseLandmarker, estimateHandPoses } from './poseTracker'
import type { PoseLandmarker } from '@mediapipe/tasks-vision'

interface GanryuCameraViewProps {
  location: LocationConfig
  onCapture: (photoDataUrl: string) => void
  onClose: () => void
  onError: (message: string) => void
}

type StanceMode = 'auto' | 'right' | 'left' | 'dual'

export function GanryuCameraView({ onCapture, onClose, onError }: GanryuCameraViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const captureRequestedRef = useRef<boolean>(false)

  const [cameraReady, setCameraReady] = useState<boolean>(false)
  const [modelReady, setModelReady] = useState<boolean>(false)
  const [poseDetected, setPoseDetected] = useState<boolean>(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [stanceMode, setStanceMode] = useState<StanceMode>('auto')

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const startCamera = useCallback(async (facing: 'user' | 'environment') => {
    try {
      stopCamera()
      // 端末の仕様に柔軟に適合するカメラ制約
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facing },
        },
        audio: false,
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        video.onloadedmetadata = () => {
          video.play().then(() => {
            setCameraReady(true)
          }).catch((e) => {
            console.warn('[GanryuCameraView] Video play warning:', e)
            setCameraReady(true)
          })
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
    let cancelled = false
    let animationFrameId: number
    let landmarkerInstance: PoseLandmarker | null = null

    // 1) カメラをまず起動
    startCamera(facingMode)

    // 2) Three.js シーンとレンダラーの初期化
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
    camera.position.z = 10

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current || undefined,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)

    // ライティング
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.3)
    scene.add(ambientLight)

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.2)
    dirLight1.position.set(5, 10, 7)
    scene.add(dirLight1)

    const dirLight2 = new THREE.DirectionalLight(0xd4af37, 1.2)
    dirLight2.position.set(-5, -5, 5)
    scene.add(dirLight2)

    // 右手用・左手用の刀モデルグループ
    const rightKatanaGroup = new THREE.Group()
    const leftKatanaGroup = new THREE.Group()
    rightKatanaGroup.visible = false
    leftKatanaGroup.visible = false
    scene.add(rightKatanaGroup)
    scene.add(leftKatanaGroup)

    // 3) 刀モデルとMediaPipeをバックグラウンドで非同期読み込み
    Promise.allSettled([loadKatanaModel(), getPoseLandmarker()]).then((results) => {
      if (cancelled) return

      const modelResult = results[0]
      const landmarkerResult = results[1]

      if (modelResult.status === 'fulfilled') {
        const katanaModel = modelResult.value
        rightKatanaGroup.add(katanaModel)
        const leftModel = katanaModel.clone(true)
        leftKatanaGroup.add(leftModel)
        setModelReady(true)
      } else {
        console.error('[GanryuCameraView] Model load error:', modelResult.reason)
      }

      if (landmarkerResult.status === 'fulfilled' && landmarkerResult.value) {
        landmarkerInstance = landmarkerResult.value
      }

      // 4) 描画・トラッキングループ開始
      const renderLoop = () => {
        if (cancelled) return

        const video = videoRef.current
        if (video && video.readyState >= 2) {
          const vw = video.videoWidth || 640
          const vh = video.videoHeight || 480
          const aspect = vw / vh

          // 正射影カメラとレンダラーのアスペクト比を同期
          camera.left = -aspect
          camera.right = aspect
          camera.top = 1
          camera.bottom = -1
          camera.updateProjectionMatrix()

          if (canvasRef.current) {
            const rect = video.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) {
              renderer.setSize(rect.width, rect.height, false)
            }
          }

          // 人物ポーズ推定
          const poses = estimateHandPoses(landmarkerInstance, video, performance.now())
          setPoseDetected(poses.hasPerson)

          // 構えモードに応じた配置
          const showRight =
            stanceMode === 'dual' ||
            stanceMode === 'right' ||
            (stanceMode === 'auto' && (poses.rightHand.detected || !poses.leftHand.detected))

          const showLeft =
            stanceMode === 'dual' ||
            stanceMode === 'left' ||
            (stanceMode === 'auto' && poses.leftHand.detected && !poses.rightHand.detected)

          // 右手の刀配置
          if (showRight && rightKatanaGroup.children.length > 0) {
            rightKatanaGroup.visible = true
            const posX = (poses.rightHand.x * 2 - 1) * aspect
            const posY = -(poses.rightHand.y * 2 - 1)
            rightKatanaGroup.position.set(posX, posY, 2)
            rightKatanaGroup.rotation.z = -poses.rightHand.angle
            const sc = poses.rightHand.scale * (vh / 600)
            rightKatanaGroup.scale.set(sc, sc, sc)
          } else {
            rightKatanaGroup.visible = false
          }

          // 左手の刀配置
          if (showLeft && leftKatanaGroup.children.length > 0) {
            leftKatanaGroup.visible = true
            const posX = (poses.leftHand.x * 2 - 1) * aspect
            const posY = -(poses.leftHand.y * 2 - 1)
            leftKatanaGroup.position.set(posX, posY, 2)
            leftKatanaGroup.rotation.z = -poses.leftHand.angle + Math.PI * 0.3
            const sc = poses.leftHand.scale * (vh / 600)
            leftKatanaGroup.scale.set(-sc, sc, sc)
          } else {
            leftKatanaGroup.visible = false
          }

          renderer.render(scene, camera)

          // 撮影リクエストの処理
          if (captureRequestedRef.current) {
            captureRequestedRef.current = false
            try {
              const photoDataUrl = captureComposite(video, renderer.domElement)
              onCapture(photoDataUrl)
            } catch (err) {
              console.error('[GanryuCameraView] Capture error:', err)
              onError('写真の撮影に失敗しました')
            }
          }
        }

        animationFrameId = requestAnimationFrame(renderLoop)
      }

      renderLoop()
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(animationFrameId)
      stopCamera()
      renderer.dispose()
    }
  }, [facingMode, stanceMode, onCapture, onError, startCamera, stopCamera])

  const handleShutter = () => {
    captureRequestedRef.current = true
  }

  const handleSwitchCamera = () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(nextFacing)
  }

  return (
    <div className="camera-screen">
      <div className="video-container" ref={containerRef}>
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className="camera-video"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            pointerEvents: 'none',
          }}
        />

        {/* ガイダンスバッジ */}
        <div className="camera-viewfinder-guide" style={{ top: '16px' }}>
          <span className="guide-text">
            {!cameraReady
              ? '📷 カメラを起動中...'
              : !modelReady
                ? '⚔️ 刀モデルを準備中...'
                : poseDetected
                  ? '⚔️ 刀を構えました！'
                  : '📸 手または上半身を映すと刀が手に握られます'}
          </span>
        </div>

        {/* 構え・スタイル切替ツールバー */}
        {modelReady && (
          <div
            style={{
              position: 'absolute',
              top: '60px',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '6px',
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(8px)',
              padding: '6px 10px',
              borderRadius: '999px',
              zIndex: 5,
            }}
          >
            <button
              type="button"
              className={`btn ${stanceMode === 'auto' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '999px' }}
              onClick={() => setStanceMode('auto')}
            >
              自動
            </button>
            <button
              type="button"
              className={`btn ${stanceMode === 'right' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '999px' }}
              onClick={() => setStanceMode('right')}
            >
              右手 ⚔️
            </button>
            <button
              type="button"
              className={`btn ${stanceMode === 'left' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '999px' }}
              onClick={() => setStanceMode('left')}
            >
              左手 ⚔️
            </button>
            <button
              type="button"
              className={`btn ${stanceMode === 'dual' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '999px' }}
              onClick={() => setStanceMode('dual')}
            >
              二刀流 ⚔️⚔️
            </button>
          </div>
        )}
      </div>

      <div className="camera-controls">
        <button
          type="button"
          className="btn btn-icon"
          onClick={handleSwitchCamera}
          title="イン/アウトカメラ切り替え"
        >
          🔄
        </button>
        <button
          type="button"
          className="btn btn-shutter"
          onClick={handleShutter}
          disabled={!cameraReady}
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
