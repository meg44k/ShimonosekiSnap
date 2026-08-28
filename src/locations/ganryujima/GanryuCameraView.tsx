import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { captureComposite } from '../../features/ar/captureComposite'
import type { LocationConfig } from '../types'
import { loadKatanaModel, type KatanaType } from './loadKatanaModel'
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
          width: { ideal: 1280 },
          height: { ideal: 720 },
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
    let cancelled = false
    let animationFrameId: number
    let landmarkerInstance: PoseLandmarker | null = null

    // 1) カメラ起動
    startCamera(facingMode)

    // 2) Three.js シーンと正射影カメラ
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current || undefined,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)

    // ライティング
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5)
    scene.add(ambientLight)

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2)
    hemiLight.position.set(0, 20, 0)
    scene.add(hemiLight)

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.2)
    dirLight1.position.set(5, 10, 8)
    scene.add(dirLight1)

    const dirLight2 = new THREE.DirectionalLight(0xd4af37, 1.0)
    dirLight2.position.set(-5, 5, -5)
    scene.add(dirLight2)

    // 右手・左手用の刀グループ
    const rightKatanaGroup = new THREE.Group()
    const leftKatanaGroup = new THREE.Group()
    scene.add(rightKatanaGroup)
    scene.add(leftKatanaGroup)

    // 3) 選択された刀モデルのロード
    const isDual = stanceMode === 'dual'
    const rightType = isDual ? 'standard' : katanaType
    const leftType = isDual ? 'wakizashi' : katanaType

    Promise.allSettled([
      loadKatanaModel(rightType),
      loadKatanaModel(leftType),
      getPoseLandmarker(),
    ]).then((results) => {
      if (cancelled) return

      const rightResult = results[0]
      const leftResult = results[1]
      const landmarkerResult = results[2]

      if (rightResult.status === 'fulfilled') {
        while (rightKatanaGroup.children.length > 0) {
          rightKatanaGroup.remove(rightKatanaGroup.children[0])
        }
        rightKatanaGroup.add(rightResult.value)
      }

      if (leftResult.status === 'fulfilled') {
        while (leftKatanaGroup.children.length > 0) {
          leftKatanaGroup.remove(leftKatanaGroup.children[0])
        }
        leftKatanaGroup.add(leftResult.value)
      }

      if (landmarkerResult.status === 'fulfilled' && landmarkerResult.value) {
        landmarkerInstance = landmarkerResult.value
      }

      setModelReady(true)

      // 4) 描画・トラッキングループ
      const renderLoop = () => {
        if (cancelled) return

        const video = videoRef.current
        const container = containerRef.current
        if (video && container && video.readyState >= 2) {
          const rect = container.getBoundingClientRect()
          const cw = rect.width || window.innerWidth
          const ch = rect.height || window.innerHeight
          const screenAspect = cw / ch

          // 正射影カメラのアスペクト比を画面コンテナに同期
          camera.left = -screenAspect
          camera.right = screenAspect
          camera.top = 1
          camera.bottom = -1
          camera.updateProjectionMatrix()

          if (canvasRef.current) {
            renderer.setSize(cw, ch, false)
          }

          // 人物ポーズ推定（コンテナ比率とobject-fit: coverの補正適用）
          const isMirror = facingMode === 'user'
          const poses = estimateHandPoses(landmarkerInstance, video, container, isMirror, performance.now())
          setPoseDetected(poses.hasPerson)

          // 構えモードに応じた判定
          const showRight =
            stanceMode === 'dual' ||
            stanceMode === 'right' ||
            (stanceMode === 'auto' && (poses.rightHand.detected || !poses.leftHand.detected))

          const showLeft =
            stanceMode === 'dual' ||
            stanceMode === 'left' ||
            (stanceMode === 'auto' && poses.leftHand.detected && !poses.rightHand.detected)

          // アニメーション時刻
          const nowMs = performance.now()

          // --- 右手の刀 ---
          if (showRight && rightKatanaGroup.children.length > 0) {
            rightKatanaGroup.visible = true
            if (poses.rightHand.detected) {
              rightKatanaGroup.position.set(poses.rightHand.threeX, poses.rightHand.threeY, 2)
              rightKatanaGroup.rotation.z = poses.rightHand.angle
              const sc = poses.rightHand.scale * 0.9
              rightKatanaGroup.scale.set(sc, sc, sc)
            } else {
              // 未検知時の待機構え表示（画面右側）
              const floatY = Math.sin(nowMs / 800) * 0.02
              rightKatanaGroup.position.set(screenAspect * 0.45, -0.3 + floatY, 2)
              rightKatanaGroup.rotation.z = -Math.PI / 6
              rightKatanaGroup.scale.set(0.9, 0.9, 0.9)
            }
          } else {
            rightKatanaGroup.visible = false
          }

          // --- 左手の刀 ---
          if (showLeft && leftKatanaGroup.children.length > 0) {
            leftKatanaGroup.visible = true
            if (poses.leftHand.detected) {
              leftKatanaGroup.position.set(poses.leftHand.threeX, poses.leftHand.threeY, 2)
              leftKatanaGroup.rotation.z = poses.leftHand.angle
              const sc = poses.leftHand.scale * 0.9
              leftKatanaGroup.scale.set(-sc, sc, sc) // 左手用に水平反転
            } else if (stanceMode === 'dual' || stanceMode === 'left') {
              // 未検知時の待機構え表示（画面左側）
              const floatY = Math.sin((nowMs + 400) / 800) * 0.02
              leftKatanaGroup.position.set(-screenAspect * 0.45, -0.3 + floatY, 2)
              leftKatanaGroup.rotation.z = Math.PI / 6
              leftKatanaGroup.scale.set(-0.75, 0.75, 0.75)
            } else {
              leftKatanaGroup.visible = false
            }
          } else {
            leftKatanaGroup.visible = false
          }

          renderer.render(scene, camera)

          // 写真撮影合成処理
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
  }, [facingMode, stanceMode, katanaType, onCapture, onError, startCamera, stopCamera])

  const handleShutter = () => {
    captureRequestedRef.current = true
  }

  const handleSwitchCamera = () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(nextFacing)
  }

  return (
    <div className="camera-screen">
      <div className="video-container" ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
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
        <div className="camera-viewfinder-guide" style={{ top: '14px' }}>
          <span className="guide-text">
            {!cameraReady
              ? '📷 カメラを起動中...'
              : !modelReady
                ? '⚔️ 刀モデルを準備中...'
                : poseDetected
                  ? '⚔️ 刀を構えました！'
                  : '📸 手をかざすと刀が手に握られます'}
          </span>
        </div>

        {/* 刀の種類 & 構え切替ツールバー */}
        {modelReady && (
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
                  自動検知
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
