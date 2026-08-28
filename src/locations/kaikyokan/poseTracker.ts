import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'

export interface HandPoseInfo {
  detected: boolean
  // 画面ピクセル座標
  pixelX: number
  pixelY: number
  // 傾き角度 (ラジアン)
  angle: number
  // スケール (腕長さに比例)
  scale: number
  isGrasping: boolean
  score: number
}

export interface PoseTrackingResult {
  rightHand: HandPoseInfo
  leftHand: HandPoseInfo
  hasPerson: boolean
}

let imageLandmarkerInstance: PoseLandmarker | null = null
let initImagePromise: Promise<PoseLandmarker | null> | null = null

export async function getImagePoseLandmarker(): Promise<PoseLandmarker | null> {
  if (imageLandmarkerInstance) return imageLandmarkerInstance
  if (initImagePromise) return initImagePromise

  initImagePromise = (async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm',
      )

      const modelUrl =
        'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

      try {
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelUrl,
            delegate: 'GPU',
          },
          runningMode: 'IMAGE',
          numPoses: 1,
          minPoseDetectionConfidence: 0.3,
          minPosePresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        })
        imageLandmarkerInstance = landmarker
        return landmarker
      } catch (gpuError) {
        console.warn('[poseTracker] GPU delegate failed, falling back to CPU:', gpuError)
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelUrl,
            delegate: 'CPU',
          },
          runningMode: 'IMAGE',
          numPoses: 1,
          minPoseDetectionConfidence: 0.3,
          minPosePresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        })
        imageLandmarkerInstance = landmarker
        return landmarker
      }
    } catch (err) {
      console.warn('[poseTracker] Failed to load MediaPipe PoseLandmarker:', err)
      return null
    }
  })()

  return initImagePromise
}

/**
 * 手首・肘・指先のランドマークから、手のひらの位置と傾きを計算
 */
function extractHandPoseFromLandmarks(
  shoulder: NormalizedLandmark | undefined,
  elbow: NormalizedLandmark | undefined,
  wrist: NormalizedLandmark | undefined,
  index: NormalizedLandmark | undefined,
  pinky: NormalizedLandmark | undefined,
  thumb: NormalizedLandmark | undefined,
  imageWidth: number,
  imageHeight: number,
  isLeftHand: boolean,
): HandPoseInfo {
  if (!wrist || !elbow || (wrist.visibility !== undefined && wrist.visibility < 0.2)) {
    return {
      detected: false,
      pixelX: isLeftHand ? imageWidth * 0.3 : imageWidth * 0.7,
      pixelY: imageHeight * 0.65,
      angle: isLeftHand ? -Math.PI / 12 : Math.PI / 12,
      scale: 1.0,
      isGrasping: false,
      score: 0,
    }
  }

  // 1. 手首と指先から手のひら中央（平らな乗せ面）の位置を計算
  let palmNorm = { x: wrist.x, y: wrist.y }
  let graspSpread = 1.0

  if (index && pinky && (index.visibility === undefined || index.visibility > 0.15)) {
    const knucklesX = (index.x + pinky.x) * 0.5
    const knucklesY = (index.y + pinky.y) * 0.5
    palmNorm = {
      x: wrist.x * 0.35 + knucklesX * 0.65,
      y: wrist.y * 0.35 + knucklesY * 0.65,
    }
    const handSpan = Math.hypot(index.x - wrist.x, index.y - wrist.y)
    const armSpan = Math.hypot(wrist.x - elbow.x, wrist.y - elbow.y) || 1
    graspSpread = handSpan / armSpan
  } else if (index && (index.visibility === undefined || index.visibility > 0.15)) {
    palmNorm = {
      x: wrist.x * 0.4 + index.x * 0.6,
      y: wrist.y * 0.4 + index.y * 0.6,
    }
  } else {
    const dirX = wrist.x - elbow.x
    const dirY = wrist.y - elbow.y
    const len = Math.hypot(dirX, dirY) || 1
    palmNorm = {
      x: wrist.x + (dirX / len) * 0.045,
      y: wrist.y + (dirY / len) * 0.045,
    }
  }

  const isGrasping = graspSpread < 0.6

  // 2. 画面ピクセル座標
  const pixelX = palmNorm.x * imageWidth
  const pixelY = palmNorm.y * imageHeight

  const elbowPixelX = elbow.x * imageWidth
  const elbowPixelY = elbow.y * imageHeight

  // 3. 腕・手の方向ベクトル（肘 ➔ 拳）
  let armDx = pixelX - elbowPixelX
  let armDy = pixelY - elbowPixelY

  if (index && (index.visibility === undefined || index.visibility > 0.15)) {
    const indexPixelX = index.x * imageWidth
    const indexPixelY = index.y * imageHeight
    const wristPixelX = wrist.x * imageWidth
    const wristPixelY = wrist.y * imageHeight
    const handDx = indexPixelX - wristPixelX
    const handDy = indexPixelY - wristPixelY
    armDx = armDx * 0.3 + handDx * 0.7
    armDy = armDy * 0.3 + handDy * 0.7
  }

  // 腕の傾き
  const armAngle = Math.atan2(armDy, armDx)

  // 4. スケール（腕の長さに比例してペンギンのサイズを決定）
  const wristPixelX = wrist.x * imageWidth
  const wristPixelY = wrist.y * imageHeight
  const armLenPx = Math.hypot(wristPixelX - elbowPixelX, wristPixelY - elbowPixelY)
  // 手のひらにちょこんと乗るサイズ（腕の長さの約1.2倍程度）
  const targetScale = Math.max(0.3, Math.min(2.0, (armLenPx * 1.2) / 667))

  return {
    detected: true,
    pixelX,
    pixelY,
    angle: armAngle,
    scale: targetScale,
    isGrasping,
    score: wrist.visibility ?? 0.85,
  }
}

/**
 * 撮影した写真（静止画 Canvas / Image）から人物の手のひらの姿勢を検出する
 */
export async function detectPoseOnImage(
  imageSource: HTMLCanvasElement | HTMLImageElement | ImageData,
  width: number,
  height: number,
): Promise<PoseTrackingResult> {
  const landmarker = await getImagePoseLandmarker()

  const defaultResult: PoseTrackingResult = {
    rightHand: {
      detected: false,
      pixelX: width * 0.7,
      pixelY: height * 0.65,
      angle: 0,
      scale: (height * 0.4) / 667,
      isGrasping: false,
      score: 0,
    },
    leftHand: {
      detected: false,
      pixelX: width * 0.3,
      pixelY: height * 0.65,
      angle: 0,
      scale: (height * 0.4) / 667,
      isGrasping: false,
      score: 0,
    },
    hasPerson: false,
  }

  if (!landmarker) {
    return defaultResult
  }

  try {
    const result = landmarker.detect(imageSource)
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
    const leftPinky = landmarks[17]
    const rightPinky = landmarks[18]
    const leftIndex = landmarks[19]
    const rightIndex = landmarks[20]
    const leftThumb = landmarks[21]
    const rightThumb = landmarks[22]

    const rightHand = extractHandPoseFromLandmarks(
      rightShoulder,
      rightElbow,
      rightWrist,
      rightIndex,
      rightPinky,
      rightThumb,
      width,
      height,
      false,
    )

    const leftHand = extractHandPoseFromLandmarks(
      leftShoulder,
      leftElbow,
      leftWrist,
      leftIndex,
      leftPinky,
      leftThumb,
      width,
      height,
      true,
    )

    return {
      rightHand,
      leftHand,
      hasPerson: rightHand.detected || leftHand.detected,
    }
  } catch (err) {
    console.error('[poseTracker] Error detecting pose on image:', err)
    return defaultResult
  }
}
