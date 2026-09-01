import { useCallback, useEffect, useRef, useState } from 'react'
import { load as loadPoseDetector } from '@tensorflow-models/pose-detection/dist/movenet/detector'
import { SINGLEPOSE_LIGHTNING } from '@tensorflow-models/pose-detection/dist/movenet/constants'
import type { PoseDetector } from '@tensorflow-models/pose-detection/dist/pose_detector'
import type { FaceLandmarksDetector } from '@tensorflow-models/face-landmarks-detection/dist/face_landmarks_detector'
import '@tensorflow/tfjs-backend-cpu'
import '@tensorflow/tfjs-backend-webgl'
import { captureComposite } from '../../features/ar/captureComposite'
import { CameraModeToggle, RecordingIndicator } from '../../features/ar/CameraControls'
import { useVideoCapture, type CompositeSources } from '../../features/ar/useVideoCapture'
import type { PersonDetectionLocationConfig } from '../types'
import {
  type CostumeTransform,
  fitCostumeTransformToBody,
  getFixedBrandLayout,
  getSnowCostumeTransform,
  poseToTrackedFace,
  removeConnectedWhiteBackground,
  smoothCostumeTransform,
} from './personDetection'
import {
  createTexturedHanbokTorso,
  drawTexturedHanbok,
} from './texturedHanbokRenderer'

interface PersonDetectionCameraViewProps {
  location: PersonDetectionLocationConfig
  onCapture: (url: string, kind?: 'photo' | 'video', blob?: Blob) => void
  onClose: () => void
  onError: (message: string) => void
}

const DETECTION_INTERVAL_MS = 120
const FACE_TRACKING_HOLD_MS = 800
const COSTUME_FACE_HOLE_CENTER_X_RATIO = 0.5
const COSTUME_FACE_HOLE_CENTER_Y_RATIO = 0.315
const COSTUME_TRANSPARENT_SEEDS = [
  { xRatio: 0.5, yRatio: 0.32 },
  { xRatio: 0.2, yRatio: 0.57 },
  { xRatio: 0.8, yRatio: 0.57 },
  { xRatio: 0.5, yRatio: 0.85 },
]
const DEFAULT_COSTUME_LAYOUT = {
  faceHoleCenterXRatio: COSTUME_FACE_HOLE_CENTER_X_RATIO,
  faceHoleCenterYRatio: COSTUME_FACE_HOLE_CENTER_Y_RATIO,
  faceHoleWidthRatio: 0.36,
  faceScale: 1.02,
  renderer: 'image',
  bodyFit: undefined,
} as const

function loadCutout(
  src: string,
  interiorSeeds: readonly { xRatio: number; yRatio: number }[] = [],
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        reject(new Error('2D context is not available'))
        return
      }
      context.drawImage(image, 0, 0)
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
      context.putImageData(removeConnectedWhiteBackground(imageData, interiorSeeds), 0, 0)
      resolve(canvas)
    }
    image.onerror = () => reject(new Error(`Failed to load overlay image: ${src}`))
    image.src = src
  })
}

export function PersonDetectionCameraView({
  location,
  onCapture,
  onClose,
  onError,
}: PersonDetectionCameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [subjectDetected, setSubjectDetected] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const costumeLayout = location.costumeLayout ?? DEFAULT_COSTUME_LAYOUT

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const videoElement = video
    const canvasElement = canvas

    let cancelled = false
    // 切替時は読み込みからやり直すので状態をリセットして案内を出す
    setReady(false)
    setSubjectDetected(false)
    let animationFrameId = 0
    let stream: MediaStream | undefined
    let faceDetector: FaceLandmarksDetector | undefined
    let poseDetector: PoseDetector | undefined
    let lastDetectionAt = 0
    let trackedCostumeTransform: CostumeTransform | undefined
    let lastFaceSeenAt = 0

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facingMode } },
        })
        // Show the live camera immediately. The detection models continue to load
        // in the background instead of blocking the first visual response.
        videoElement.srcObject = stream
        await videoElement.play()

        const [overlayImage, costumeImage, loadedPoseDetector] =
          await Promise.all([
            loadCutout(location.overlaySrc),
            loadCutout(
              location.costumeSrc,
              location.costumeTransparentSeeds ?? COSTUME_TRANSPARENT_SEEDS,
            ),
            loadPoseDetector({
              modelType: SINGLEPOSE_LIGHTNING,
              enableSmoothing: true,
            }),
          ])
        poseDetector = loadedPoseDetector
        const texturedTorso =
          costumeLayout.renderer === 'textured-hanbok'
            ? createTexturedHanbokTorso(costumeImage)
            : undefined
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          loadedPoseDetector.dispose()
          return
        }

        canvasElement.width = videoElement.videoWidth
        canvasElement.height = videoElement.videoHeight
        const context = canvasElement.getContext('2d')
        if (!context) throw new Error('2D context is not available')
        setReady(true)

        // MoveNet provides enough facial keypoints to begin costume tracking.
        // Load the heavier FaceMesh detector only after the camera and the
        // first-pass filter are available, then upgrade the tracking precision.
        void import('@tensorflow-models/face-landmarks-detection/dist/tfjs/detector')
          .then(({ load }) =>
            load({
              runtime: 'tfjs',
              maxFaces: 1,
              refineLandmarks: false,
            }),
          )
          .then((loadedFaceDetector) => {
            if (cancelled) {
              loadedFaceDetector.dispose()
              return
            }
            faceDetector = loadedFaceDetector
          })
          .catch((error: unknown) => {
            // Keep the filter usable with MoveNet facial keypoints when the
            // optional precision model cannot be loaded.
            console.warn(`[${location.id}] FaceMesh enhancement unavailable`, error)
          })

        const detect = async (now: number) => {
          if (cancelled) return
          try {
            if (now - lastDetectionAt >= DETECTION_INTERVAL_MS) {
              lastDetectionAt = now
              const [faces, poses] = await Promise.all([
                faceDetector
                  ? faceDetector.estimateFaces(videoElement, {
                      flipHorizontal: false,
                      staticImageMode: false,
                    })
                  : Promise.resolve([]),
                loadedPoseDetector.estimatePoses(videoElement, {
                  maxPoses: 1,
                  flipHorizontal: false,
                }),
              ])
              if (cancelled) return

              const meshFace = faces[0]
              const pose = poses[0]
              const poseFace = poseToTrackedFace(pose?.keypoints ?? [])
              const face = meshFace ?? poseFace
              if (face) {
                const faceTransform = getSnowCostumeTransform(
                  face.box,
                  face.keypoints,
                  pose?.keypoints ?? [],
                  costumeImage.width / costumeImage.height,
                  costumeLayout.faceHoleWidthRatio,
                  costumeLayout.faceScale,
                )
                const currentTransform = costumeLayout.bodyFit
                  ? fitCostumeTransformToBody(
                      faceTransform,
                      pose?.keypoints ?? [],
                      costumeImage.width / costumeImage.height,
                      costumeLayout.bodyFit,
                    )
                  : faceTransform
                trackedCostumeTransform = trackedCostumeTransform
                  ? smoothCostumeTransform(trackedCostumeTransform, currentTransform)
                  : currentTransform
                lastFaceSeenAt = now
              }
              const costumeTransform =
                face || now - lastFaceSeenAt <= FACE_TRACKING_HOLD_MS
                  ? trackedCostumeTransform
                  : undefined
              const hasSubject = Boolean(costumeTransform)
              context.clearRect(0, 0, canvasElement.width, canvasElement.height)
              setSubjectDetected(hasSubject)

              if (hasSubject) {
                if (costumeTransform) {
                  if (costumeLayout.renderer === 'textured-hanbok' && texturedTorso) {
                    drawTexturedHanbok(
                      context,
                      costumeImage,
                      texturedTorso,
                      costumeTransform,
                      pose?.keypoints ?? [],
                      costumeLayout,
                    )
                  } else {
                    context.save()
                    context.translate(costumeTransform.anchorX, costumeTransform.anchorY)
                    context.rotate(costumeTransform.rotation)
                    context.drawImage(
                      costumeImage,
                      -costumeTransform.width * costumeLayout.faceHoleCenterXRatio,
                      -costumeTransform.height * costumeLayout.faceHoleCenterYRatio,
                      costumeTransform.width,
                      costumeTransform.height,
                    )
                    context.restore()
                  }
                }
              }

              const brand = getFixedBrandLayout(
                canvasElement.width,
                canvasElement.height,
                canvasElement.clientWidth,
                canvasElement.clientHeight,
                overlayImage.width / overlayImage.height,
              )
              if (location.showBrandImage !== false) {
                context.drawImage(
                  overlayImage,
                  brand.image.x,
                  brand.image.y,
                  brand.image.width,
                  brand.image.height,
                )
              }
              context.save()
              context.font = `700 ${brand.fontSize}px sans-serif`
              context.textAlign = 'left'
              context.textBaseline = 'alphabetic'
              context.lineWidth = Math.max(3, brand.fontSize * 0.18)
              context.lineJoin = 'round'
              context.strokeStyle = 'rgba(0, 0, 0, 0.78)'
              context.fillStyle = '#ffffff'
              context.strokeText(location.brandLabel, brand.textX, brand.textBaselineY)
              context.fillText(location.brandLabel, brand.textX, brand.textBaselineY)
              context.restore()
            }
            animationFrameId = requestAnimationFrame(detect)
          } catch (error) {
            console.error(`[${location.id}] face filter stopped`, error)
            if (!cancelled) onError('顔フィルター処理中にエラーが発生しました')
          }
        }
        animationFrameId = requestAnimationFrame(detect)
      } catch (error) {
        console.error(`[${location.id}] failed to start face filter`, error)
        if (!cancelled) {
          onError(
            '顔フィルターを起動できませんでした。カメラの許可と通信環境を確認してください。',
          )
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      cancelAnimationFrame(animationFrameId)
      stream?.getTracks().forEach((track) => track.stop())
      faceDetector?.dispose()
      poseDetector?.dispose()
      videoElement.srcObject = null
    }
  }, [costumeLayout, location, onError, facingMode])

  const getSources = useCallback((): CompositeSources | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return null
    return { video, overlay: canvas, isMirror: false }
  }, [])

  const { videoSupported, mode, setMode, recording, elapsedSec, startRecording, stopRecording } =
    useVideoCapture({
      getSources,
      onVideo: (url, blob) => onCapture(url, 'video', blob),
      onError,
    })

  const toggleFacing = () => {
    if (!recording) setFacingMode((current) => (current === 'user' ? 'environment' : 'user'))
  }

  const handleShutter = () => {
    if (mode === 'video') {
      if (recording) stopRecording()
      else startRecording()
      return
    }
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    try {
      onCapture(captureComposite(video, canvas), 'photo')
    } catch (error) {
      console.error(`[${location.id}] failed to capture photo`, error)
      onError('撮影に失敗しました')
    }
  }

  return (
    <div className="camera-screen">
      <div className="video-container person-detection-container">
        <video ref={videoRef} className="person-camera-layer" muted playsInline />
        <canvas ref={canvasRef} className="person-camera-layer person-overlay-canvas" />
        {recording && <RecordingIndicator elapsedSec={elapsedSec} />}
        {!recording && (!ready || !subjectDetected) && (
          <div className="ar-status-overlay">
            {!ready ? 'フェイスフィルターを読み込み中...' : location.guidanceText}
          </div>
        )}
      </div>
      {videoSupported && !recording && (
        <CameraModeToggle mode={mode} onChange={setMode} disabled={!ready} />
      )}
      <div className="camera-controls">
        <button
          type="button"
          className="btn btn-icon"
          onClick={toggleFacing}
          disabled={!ready || recording}
          title="イン/アウトカメラ切り替え"
        >
          🔄
        </button>
        <button
          type="button"
          className={`btn btn-shutter${mode === 'video' ? ' is-video' : ''}${
            recording ? ' is-recording' : ''
          }`}
          onClick={handleShutter}
          disabled={!ready}
          title={mode === 'video' ? (recording ? '録画停止' : '録画開始') : '撮影'}
        >
          <span className="shutter-inner" />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          onClick={onClose}
          disabled={recording}
          title="閉じる"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
