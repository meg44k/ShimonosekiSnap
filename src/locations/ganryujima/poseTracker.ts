import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'

export interface HandPoseInfo {
  detected: boolean
  x: number
  y: number
  z: number
  angle: number
  scale: number
  score: number
}

export interface PoseTrackingResult {
  rightHand: HandPoseInfo
  leftHand: HandPoseInfo
  hasPerson: boolean
}

let poseLandmarkerInstance: PoseLandmarker | null = null
let initPromise: Promise<PoseLandmarker | null> | null = null

export async function getPoseLandmarker(): Promise<PoseLandmarker | null> {
  if (poseLandmarkerInstance) return poseLandmarkerInstance
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm',
      )

      const modelUrl =
        'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

      // まず GPU デリゲートでの初期化を試行
      try {
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelUrl,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        })
        poseLandmarkerInstance = landmarker
        return landmarker
      } catch (gpuError) {
        console.warn('[poseTracker] GPU delegate failed, falling back to CPU:', gpuError)
        // CPU デリゲートで再試行
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelUrl,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        })
        poseLandmarkerInstance = landmarker
        return landmarker
      }
    } catch (err) {
      console.warn('[poseTracker] Failed to load MediaPipe PoseLandmarker:', err)
      return null
    }
  })()

  return initPromise
}

// ジッター抑制用スムージング係数
const SMOOTH_ALPHA = 0.65

class Smoother {
  x = 0.5
  y = 0.5
  z = 0
  angle = -Math.PI / 4
  scale = 1.0
  initialized = false

  update(targetX: number, targetY: number, targetZ: number, targetAngle: number, targetScale: number) {
    if (!this.initialized) {
      this.x = targetX
      this.y = targetY
      this.z = targetZ
      this.angle = targetAngle
      this.scale = targetScale
      this.initialized = true
      return
    }

    this.x = this.x * (1 - SMOOTH_ALPHA) + targetX * SMOOTH_ALPHA
    this.y = this.y * (1 - SMOOTH_ALPHA) + targetY * SMOOTH_ALPHA
    this.z = this.z * (1 - SMOOTH_ALPHA) + targetZ * SMOOTH_ALPHA
    this.scale = this.scale * (1 - SMOOTH_ALPHA) + targetScale * SMOOTH_ALPHA

    // 角度のスムージング（周期性を考慮）
    let diff = targetAngle - this.angle
    while (diff < -Math.PI) diff += Math.PI * 2
    while (diff > Math.PI) diff -= Math.PI * 2
    this.angle += diff * SMOOTH_ALPHA
  }
}

const rightSmoother = new Smoother()
const leftSmoother = new Smoother()

/**
 * 肘と手首、人差し指の位置から手の位置・構えの角度・スケールを計算する
 */
function extractHandPose(
  shoulder: NormalizedLandmark | undefined,
  elbow: NormalizedLandmark | undefined,
  wrist: NormalizedLandmark | undefined,
  index: NormalizedLandmark | undefined,
  smoother: Smoother,
): HandPoseInfo {
  if (!wrist || !elbow || (wrist.visibility !== undefined && wrist.visibility < 0.3)) {
    return {
      detected: false,
      x: smoother.x,
      y: smoother.y,
      z: smoother.z,
      angle: smoother.angle,
      scale: smoother.scale,
      score: 0,
    }
  }

  // 手首の位置
  const targetX = wrist.x
  const targetY = wrist.y
  const targetZ = wrist.z || 0

  // 腕（肘 ➔ 手首）または手（手首 ➔ 指先）の向きから刀を構える角度を算出
  let armDx = wrist.x - elbow.x
  let armDy = wrist.y - elbow.y

  if (index && (index.visibility === undefined || index.visibility > 0.2)) {
    // 指先の方向も加味してより自然な刃先の向きにする
    armDx = armDx * 0.4 + (index.x - wrist.x) * 0.6
    armDy = armDy * 0.4 + (index.y - wrist.y) * 0.6
  }

  // 刀が手から前上方へ突き出る自然な構え角度
  const rawAngle = Math.atan2(armDy, armDx) + Math.PI * 0.15

  // 体格・腕の長さに比例したスケール
  const armLen = Math.hypot(wrist.x - elbow.x, wrist.y - elbow.y)
  const shoulderDist = shoulder ? Math.hypot(wrist.x - shoulder.x, wrist.y - shoulder.y) : armLen * 2
  const targetScale = Math.max(0.6, Math.min(2.5, shoulderDist * 3.5))

  smoother.update(targetX, targetY, targetZ, rawAngle, targetScale)

  return {
    detected: true,
    x: smoother.x,
    y: smoother.y,
    z: smoother.z,
    angle: smoother.angle,
    scale: smoother.scale,
    score: wrist.visibility ?? 0.8,
  }
}

/**
 * ビデオフレームから人物の手の姿勢を抽出する
 */
export function estimateHandPoses(
  landmarker: PoseLandmarker | null,
  video: HTMLVideoElement,
  timestampMs: number,
): PoseTrackingResult {
  const defaultResult: PoseTrackingResult = {
    rightHand: { detected: false, x: 0.65, y: 0.6, z: 0, angle: -Math.PI / 3, scale: 1.1, score: 0 },
    leftHand: { detected: false, x: 0.35, y: 0.6, z: 0, angle: -Math.PI * 0.7, scale: 1.1, score: 0 },
    hasPerson: false,
  }

  if (!landmarker || video.videoWidth === 0 || video.videoHeight === 0) {
    return defaultResult
  }

  try {
    const result = landmarker.detectForVideo(video, timestampMs)
    if (!result.landmarks || result.landmarks.length === 0) {
      return defaultResult
    }

    const landmarks = result.landmarks[0]
    const leftShoulder = landmarks[11]
    const rightShoulder = landmarks[12]
    const leftElbow = landmarks[13]
    const rightElbow = landmarks[14]
    const leftWrist = landmarks[15]
    const rightWrist = landmarks[16]
    const leftIndex = landmarks[19]
    const rightIndex = landmarks[20]

    const rightHand = extractHandPose(rightShoulder, rightElbow, rightWrist, rightIndex, rightSmoother)
    const leftHand = extractHandPose(leftShoulder, leftElbow, leftWrist, leftIndex, leftSmoother)

    return {
      rightHand,
      leftHand,
      hasPerson: rightHand.detected || leftHand.detected,
    }
  } catch (err) {
    console.warn('[poseTracker] Error detecting pose:', err)
    return defaultResult
  }
}
