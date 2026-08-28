import { useEffect, useRef, useState } from 'react'
import { load as loadPoseDetector } from '@tensorflow-models/pose-detection/dist/movenet/detector'
import { SINGLEPOSE_LIGHTNING } from '@tensorflow-models/pose-detection/dist/movenet/constants'
import type { PoseDetector } from '@tensorflow-models/pose-detection/dist/pose_detector'
import { load as loadFaceLandmarksDetector } from '@tensorflow-models/face-landmarks-detection/dist/tfjs/detector'
import type { FaceLandmarksDetector } from '@tensorflow-models/face-landmarks-detection/dist/face_landmarks_detector'
import '@tensorflow/tfjs-backend-cpu'
import '@tensorflow/tfjs-backend-webgl'
import { captureComposite } from '../../features/ar/captureComposite'
import type { PersonDetectionLocationConfig } from '../types'
import {
  type CostumeTransform,
  getFixedBrandLayout,
  getSnowCostumeTransform,
  poseToTrackedFace,
  removeConnectedWhiteBackground,
  smoothCostumeTransform,
} from './personDetection'

interface PersonDetectionCameraViewProps {
  location: PersonDetectionLocationConfig
  onCapture: (photoDataUrl: string) => void
  onClose: () => void
  onError: (message: string) => void
}

const DETECTION_INTERVAL_MS = 120
const FACE_TRACKING_HOLD_MS = 800
const COSTUME_FACE_HOLE_CENTER_X_RATIO = 0.5
const COSTUME_FACE_HOLE_CENTER_Y_RATIO = 0.315
const BRAND_LABEL = '海峡ゆめタワー'
const COSTUME_TRANSPARENT_SEEDS = [
  { xRatio: 0.5, yRatio: 0.32 },
  { xRatio: 0.2, yRatio: 0.57 },
  { xRatio: 0.8, yRatio: 0.57 },
  { xRatio: 0.5, yRatio: 0.85 },
]

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

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const videoElement = video
    const canvasElement = canvas

    let cancelled = false
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
          video: { facingMode: { ideal: 'environment' } },
        })
        const [overlayImage, costumeImage, loadedFaceDetector, loadedPoseDetector] =
          await Promise.all([
            loadCutout(location.overlaySrc),
            loadCutout(location.costumeSrc, COSTUME_TRANSPARENT_SEEDS),
            loadFaceLandmarksDetector({
              runtime: 'tfjs',
              maxFaces: 1,
              refineLandmarks: false,
            }),
            loadPoseDetector({
              modelType: SINGLEPOSE_LIGHTNING,
              enableSmoothing: true,
            }),
          ])
        faceDetector = loadedFaceDetector
        poseDetector = loadedPoseDetector
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          loadedFaceDetector.dispose()
          loadedPoseDetector.dispose()
          return
        }

        videoElement.srcObject = stream
        await videoElement.play()
        canvasElement.width = videoElement.videoWidth
        canvasElement.height = videoElement.videoHeight
        const context = canvasElement.getContext('2d')
        if (!context) throw new Error('2D context is not available')
        setReady(true)

        const detect = async (now: number) => {
          if (cancelled) return
          try {
            if (now - lastDetectionAt >= DETECTION_INTERVAL_MS) {
              lastDetectionAt = now
              const [faces, poses] = await Promise.all([
                loadedFaceDetector.estimateFaces(videoElement, {
                  flipHorizontal: false,
                  staticImageMode: false,
                }),
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
                const currentTransform = getSnowCostumeTransform(
                  face.box,
                  face.keypoints,
                  pose?.keypoints ?? [],
                  costumeImage.width / costumeImage.height,
                )
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
                  context.save()
                  context.translate(costumeTransform.anchorX, costumeTransform.anchorY)
                  context.rotate(costumeTransform.rotation)
                  context.drawImage(
                    costumeImage,
                    -costumeTransform.width * COSTUME_FACE_HOLE_CENTER_X_RATIO,
                    -costumeTransform.height * COSTUME_FACE_HOLE_CENTER_Y_RATIO,
                    costumeTransform.width,
                    costumeTransform.height,
                  )
                  context.restore()
                }
              }

              const brand = getFixedBrandLayout(
                canvasElement.width,
                canvasElement.height,
                canvasElement.clientWidth,
                canvasElement.clientHeight,
                overlayImage.width / overlayImage.height,
              )
              context.drawImage(
                overlayImage,
                brand.image.x,
                brand.image.y,
                brand.image.width,
                brand.image.height,
              )
              context.save()
              context.font = `700 ${brand.fontSize}px sans-serif`
              context.textAlign = 'left'
              context.textBaseline = 'alphabetic'
              context.lineWidth = Math.max(3, brand.fontSize * 0.18)
              context.lineJoin = 'round'
              context.strokeStyle = 'rgba(0, 0, 0, 0.78)'
              context.fillStyle = '#ffffff'
              context.strokeText(BRAND_LABEL, brand.textX, brand.textBaselineY)
              context.fillText(BRAND_LABEL, brand.textX, brand.textBaselineY)
              context.restore()
            }
            animationFrameId = requestAnimationFrame(detect)
          } catch (error) {
            console.error('[yumetower] face filter stopped', error)
            if (!cancelled) onError('顔フィルター処理中にエラーが発生しました')
          }
        }
        animationFrameId = requestAnimationFrame(detect)
      } catch (error) {
        console.error('[yumetower] failed to start face filter', error)
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
  }, [location, onError])

  const handleShutter = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    try {
      onCapture(captureComposite(video, canvas))
    } catch (error) {
      console.error('[yumetower] failed to capture photo', error)
      onError('撮影に失敗しました')
    }
  }

  return (
    <div className="camera-screen">
      <div className="video-container person-detection-container">
        <video ref={videoRef} className="person-camera-layer" muted playsInline />
        <canvas ref={canvasRef} className="person-camera-layer person-overlay-canvas" />
        {(!ready || !subjectDetected) && (
          <div className="ar-status-overlay">
            {!ready ? 'SNOW風フェイスフィルターを読み込み中...' : location.guidanceText}
          </div>
        )}
      </div>
      <div className="camera-controls">
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
