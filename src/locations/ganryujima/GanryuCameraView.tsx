import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import type { LocationConfig } from '../types'
import { loadKatanaModel, type KatanaType } from './loadKatanaModel'
import { getPoseLandmarker, estimateHandPoses, type PoseTrackingResult } from './poseTracker'
import type { PoseLandmarker } from '@mediapipe/tasks-vision'

interface GanryuCameraViewProps {
  location: LocationConfig
  onCapture: (photoDataUrl: string) => void
  onClose: () => void
  onError: (message: string) => void
}

type StanceMode = 'auto' | 'right' | 'left' | 'dual'

/**
 * 撮影時にビデオ + 3D刀 + 指の前面オクルージョンを結合して高解像度画像を生成
 */
function captureGanryuComposite(
  video: HTMLVideoElement,
  threeCanvas: HTMLCanvasElement,
  occlusionCanvas: HTMLCanvasElement | null,
  isMirror: boolean,
): string {
  const canvas = document.createElement('canvas')
  canvas.width = threeCanvas.width
  canvas.height = threeCanvas.height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('2D context is not available')
  }

  const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight)
  const sw = canvas.width / scale
  const sh = canvas.height / scale
  const sx = (video.videoWidth - sw) / 2
  const sy = (video.videoHeight - sh) / 2

  ctx.save()
  if (isMirror) {
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  ctx.restore()

  // 3D刀を描画
  ctx.drawImage(threeCanvas, 0, 0, canvas.width, canvas.height)

  // 指の前面オクルージョン（手前レイヤー）を描画
  if (occlusionCanvas) {
    ctx.drawImage(occlusionCanvas, 0, 0, canvas.width, canvas.height)
  }

  return canvas.toDataURL('image/png')
}

export function GanryuCameraView({ onCapture, onClose, onError }: GanryuCameraViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const occlusionCanvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const captureRequestedRef = useRef<boolean>(false)

  const [cameraReady, setCameraReady] = useState<boolean>(false)
  const [modelReady, setModelReady] = useState<boolean>(false)
  const [poseState, setPoseState] = useState<{ hasPerson: boolean; isGrasping: boolean }>({
    hasPerson: false,
    isGrasping: false,
  })
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

    // ライティング（刀身の刃紋と金属光沢を強調）
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.6)
    scene.add(ambientLight)

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.3)
    hemiLight.position.set(0, 20, 0)
    scene.add(hemiLight)

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.5)
    dirLight1.position.set(5, 10, 8)
    scene.add(dirLight1)

    const dirLight2 = new THREE.DirectionalLight(0xd4af37, 1.4)
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

      // 4) 指の前面オクルージョン描画関数
      const drawFingerOcclusion = (
        poses: PoseTrackingResult,
        video: HTMLVideoElement,
        cw: number,
        ch: number,
        isMirror: boolean,
      ) => {
        const occCanvas = occlusionCanvasRef.current
        if (!occCanvas) return

        if (occCanvas.width !== cw || occCanvas.height !== ch) {
          occCanvas.width = cw
          occCanvas.height = ch
        }

        const ctx = occCanvas.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, cw, ch)

        const drawHandCutout = (info: typeof poses.rightHand) => {
          if (!info.detected || !info.fingerOcclusion) return

          const { cx, cy, rx, ry, angle } = info.fingerOcclusion

          ctx.save()
          // 拳の指部分を楕円クリッピングパスとして定義
          ctx.beginPath()
          ctx.ellipse(cx, cy, rx, ry, angle, 0, Math.PI * 2)
          ctx.clip()

          // ビデオの該当領域を描画（指が刀の柄の手前に乗る）
          const scale = Math.max(cw / video.videoWidth, ch / video.videoHeight)
          const sw = cw / scale
          const sh = ch / scale
          const sx = (video.videoWidth - sw) / 2
          const sy = (video.videoHeight - sh) / 2

          ctx.save()
          if (isMirror) {
            ctx.translate(cw, 0)
            ctx.scale(-1, 1)
          }
          // 手前の指の立体感
          ctx.globalAlpha = info.isGrasping ? 0.95 : 0.8
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch)
          ctx.restore()

          // 指の輪郭に自然なソフトエッジと陰影を付与
          ctx.strokeStyle = 'rgba(0,0,0,0.18)'
          ctx.lineWidth = 2
          ctx.stroke()

          ctx.restore()
        }

        if (rightKatanaGroup.visible && poses.rightHand.detected) {
          drawHandCutout(poses.rightHand)
        }
        if (leftKatanaGroup.visible && poses.leftHand.detected) {
          drawHandCutout(poses.leftHand)
        }
      }

      // 5) 描画・トラッキングループ
      const renderLoop = () => {
        if (cancelled) return

        const video = videoRef.current
        const container = containerRef.current
        if (video && container && video.readyState >= 2) {
          const rect = container.getBoundingClientRect()
          const cw = rect.width || window.innerWidth
          const ch = rect.height || window.innerHeight
          const screenAspect = cw / ch

          camera.left = -screenAspect
          camera.right = screenAspect
          camera.top = 1
          camera.bottom = -1
          camera.updateProjectionMatrix()

          if (canvasRef.current) {
            renderer.setSize(cw, ch, false)
          }

          // 人物ポーズ推定（幾何学的角度拘束 + 把持判定 + オクルージョン）
          const isMirror = facingMode === 'user'
          const poses = estimateHandPoses(landmarkerInstance, video, container, isMirror, performance.now())
          setPoseState({
            hasPerson: poses.hasPerson,
            isGrasping: poses.rightHand.isGrasping || poses.leftHand.isGrasping,
          })

          const showRight =
            stanceMode === 'dual' ||
            stanceMode === 'right' ||
            (stanceMode === 'auto' && (poses.rightHand.detected || !poses.leftHand.detected))

          const showLeft =
            stanceMode === 'dual' ||
            stanceMode === 'left' ||
            (stanceMode === 'auto' && poses.leftHand.detected && !poses.rightHand.detected)

          const nowMs = performance.now()

          // --- 右手の刀 ---
          if (showRight && rightKatanaGroup.children.length > 0) {
            rightKatanaGroup.visible = true
            if (poses.rightHand.detected) {
              rightKatanaGroup.position.set(poses.rightHand.threeX, poses.rightHand.threeY, 2)
              rightKatanaGroup.rotation.z = poses.rightHand.angle
              const sc = poses.rightHand.scale * 0.95
              rightKatanaGroup.scale.set(sc, sc, sc)
            } else {
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
              const sc = poses.leftHand.scale * 0.95
              leftKatanaGroup.scale.set(-sc, sc, sc)
            } else if (stanceMode === 'dual' || stanceMode === 'left') {
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

          // 指の前面オクルージョン（手前レイヤー）の描画
          drawFingerOcclusion(poses, video, cw, ch, isMirror)

          // 撮影リクエストの処理
          if (captureRequestedRef.current) {
            captureRequestedRef.current = false
            try {
              const photoDataUrl = captureGanryuComposite(
                video,
                renderer.domElement,
                occlusionCanvasRef.current,
                isMirror,
              )
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
      <div
        className="video-container"
        ref={containerRef}
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

        {/* 3D刀描画キャンバス */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />

        {/* 指の前面オクルージョンキャンバス（柄を手前に包み込むレイヤー） */}
        <canvas
          ref={occlusionCanvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            pointerEvents: 'none',
            zIndex: 3,
          }}
        />

        {/* ガイダンスバッジ */}
        <div className="camera-viewfinder-guide" style={{ top: '14px', zIndex: 4 }}>
          <span className="guide-text">
            {!cameraReady
              ? '📷 カメラを起動中...'
              : !modelReady
                ? '⚔️ 刀モデルを準備中...'
                : poseState.isGrasping
                  ? '⚔️ 刀をしっかりと握りました！'
                  : poseState.hasPerson
                    ? '✊ 手を握り込むと刀をしっかり構えます'
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
