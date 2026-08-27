import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { captureComposite } from '../../features/ar/captureComposite'
import type { LocationConfig } from '../types'
import { loadKatanaModel } from './loadKatanaModel'
import { getPoseLandmarker, estimateHandPoses } from './poseTracker'

interface GanryuCameraViewProps {
  location: LocationConfig
  onCapture: (photoDataUrl: string) => void
  onClose: () => void
  onError: (message: string) => void
}

type StanceMode = 'auto' | 'right' | 'left' | 'dual'

export function GanryuCameraView({ location, onCapture, onClose, onError }: GanryuCameraViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const captureRequestedRef = useRef<boolean>(false)

  const [ready, setReady] = useState<boolean>(false)
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
        await videoRef.current.play()
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

    // 1) Three.js シーンとレンダラーの初期化
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
    renderer.shadowMap.enabled = true

    // ライティング（刀の金属光沢と陰影を強調）
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2)
    scene.add(ambientLight)

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.0)
    dirLight1.position.set(5, 10, 7)
    scene.add(dirLight1)

    const dirLight2 = new THREE.DirectionalLight(0xd4af37, 1.0)
    dirLight2.position.set(-5, -5, 5)
    scene.add(dirLight2)

    // 右手用・左手用の刀モデルグループ
    const rightKatanaGroup = new THREE.Group()
    const leftKatanaGroup = new THREE.Group()
    rightKatanaGroup.visible = false
    leftKatanaGroup.visible = false
    scene.add(rightKatanaGroup)
    scene.add(leftKatanaGroup)

    // 2) 刀モデルとMediaPipeの非同期読み込み
    Promise.all([loadKatanaModel(), getPoseLandmarker(), startCamera(facingMode)])
      .then(([katanaModel, landmarker, stream]) => {
        if (cancelled || !stream) return

        // 刀モデルを右手用と左手用にクローン
        rightKatanaGroup.add(katanaModel)
        const leftModel = katanaModel.clone(true)
        leftKatanaGroup.add(leftModel)

        setReady(true)

        // 3) 毎フレームのアニメーション・トラッキングループ
        const renderLoop = () => {
          if (cancelled) return

          const video = videoRef.current
          if (video && video.readyState >= 2 && landmarker) {
            const vw = video.videoWidth
            const vh = video.videoHeight
            const aspect = vw / vh

            // レンダラーと正射影カメラのアスペクト比をビデオに同期
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

            // 人物ポーズのリアルタイム推定
            const poses = estimateHandPoses(landmarker, video, performance.now())
            const isDetected = poses.hasPerson
            setPoseDetected(isDetected)

            // 表示モード（自動／右手／左手／二刀流）に応じた刀の配置
            const showRight =
              stanceMode === 'dual' ||
              stanceMode === 'right' ||
              (stanceMode === 'auto' && (poses.rightHand.detected || !poses.leftHand.detected))

            const showLeft =
              stanceMode === 'dual' ||
              stanceMode === 'left' ||
              (stanceMode === 'auto' && poses.leftHand.detected && !poses.rightHand.detected)

            // --- 右手の刀配置 ---
            if (showRight) {
              rightKatanaGroup.visible = true
              // ビデオ座標 (0〜1) ➔ Three.js 座標系 (-aspect〜aspect, -1〜1)
              const posX = (poses.rightHand.x * 2 - 1) * aspect
              const posY = -(poses.rightHand.y * 2 - 1)
              rightKatanaGroup.position.set(posX, posY, 2)
              rightKatanaGroup.rotation.z = -poses.rightHand.angle
              const sc = poses.rightHand.scale * (vh / 600)
              rightKatanaGroup.scale.set(sc, sc, sc)
            } else {
              rightKatanaGroup.visible = false
            }

            // --- 左手の刀配置 ---
            if (showLeft) {
              leftKatanaGroup.visible = true
              const posX = (poses.leftHand.x * 2 - 1) * aspect
              const posY = -(poses.leftHand.y * 2 - 1)
              leftKatanaGroup.position.set(posX, posY, 2)
              leftKatanaGroup.rotation.z = -poses.leftHand.angle + Math.PI * 0.3
              const sc = poses.leftHand.scale * (vh / 600)
              leftKatanaGroup.scale.set(-sc, sc, sc) // 左手用に反転
            } else {
              leftKatanaGroup.visible = false
            }

            renderer.render(scene, camera)

            // シャッター押下時の写真合成
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
      .catch((err) => {
        console.error('[GanryuCameraView] Init error:', err)
        if (!cancelled) {
          onError('刀エフェクトの読み込みに失敗しました')
        }
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

        {/* 認識ガイダンスバッジ */}
        <div className="camera-viewfinder-guide" style={{ top: '16px' }}>
          <span className="guide-text">
            {!ready
              ? '⚔️ 刀モデルを読み込み中...'
              : poseDetected
                ? '⚔️ 刀を構えました！'
                : '📸 手または上半身を映すと刀が手に握られます'}
          </span>
        </div>

        {/* 構え・スタイル切替ツールバー */}
        {ready && (
          <div
            style={{
              position: 'absolute',
              top: '64px',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '8px',
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              padding: '6px 12px',
              borderRadius: '999px',
              zIndex: 5,
            }}
          >
            <button
              type="button"
              className={`btn ${stanceMode === 'auto' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 12px', fontSize: '12px', borderRadius: '999px' }}
              onClick={() => setStanceMode('auto')}
            >
              自動
            </button>
            <button
              type="button"
              className={`btn ${stanceMode === 'right' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 12px', fontSize: '12px', borderRadius: '999px' }}
              onClick={() => setStanceMode('right')}
            >
              右手 ⚔️
            </button>
            <button
              type="button"
              className={`btn ${stanceMode === 'left' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 12px', fontSize: '12px', borderRadius: '999px' }}
              onClick={() => setStanceMode('left')}
            >
              左手 ⚔️
            </button>
            <button
              type="button"
              className={`btn ${stanceMode === 'dual' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 12px', fontSize: '12px', borderRadius: '999px' }}
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
          disabled={!ready}
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
