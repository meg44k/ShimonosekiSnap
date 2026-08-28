import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'

export interface HandPoseInfo {
  detected: boolean
  // Three.js 正射影座標系 (-screenAspect 〜 screenAspect, -1.0 〜 1.0)
  threeX: number
  threeY: number
  // 画面ピクセル座標
  pixelX: number
  pixelY: number
  // 刀の回転角 (ラジアン)
  angle: number
  // スケール
  scale: number
  score: number
}

export interface PoseTrackingResult {
  rightHand: HandPoseInfo
  leftHand: HandPoseInfo
  hasPerson: boolean
}

export interface ViewportTransform {
  videoWidth: number
  videoHeight: number
  containerWidth: number
  containerHeight: number
  isMirror: boolean
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

      try {
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelUrl,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.35,
          minPosePresenceConfidence: 0.35,
          minTrackingConfidence: 0.35,
        })
        poseLandmarkerInstance = landmarker
        return landmarker
      } catch (gpuError) {
        console.warn('[poseTracker] GPU delegate failed, falling back to CPU:', gpuError)
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelUrl,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.35,
          minPosePresenceConfidence: 0.35,
          minTrackingConfidence: 0.35,
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
const SMOOTH_ALPHA = 0.55

class Smoother {
  threeX = 0
  threeY = 0
  pixelX = 0
  pixelY = 0
  angle = 0
  scale = 1.0
  initialized = false

  update(threeX: number, threeY: number, pixelX: number, pixelY: number, targetAngle: number, targetScale: number) {
    if (!this.initialized) {
      this.threeX = threeX
      this.threeY = threeY
      this.pixelX = pixelX
      this.pixelY = pixelY
      this.angle = targetAngle
      this.scale = targetScale
      this.initialized = true
      return
    }

    this.threeX = this.threeX * (1 - SMOOTH_ALPHA) + threeX * SMOOTH_ALPHA
    this.threeY = this.threeY * (1 - SMOOTH_ALPHA) + threeY * SMOOTH_ALPHA
    this.pixelX = this.pixelX * (1 - SMOOTH_ALPHA) + pixelX * SMOOTH_ALPHA
    this.pixelY = this.pixelY * (1 - SMOOTH_ALPHA) + pixelY * SMOOTH_ALPHA
    this.scale = this.scale * (1 - SMOOTH_ALPHA) + targetScale * SMOOTH_ALPHA

    let diff = targetAngle - this.angle
    while (diff < -Math.PI) diff += Math.PI * 2
    while (diff > Math.PI) diff -= Math.PI * 2
    this.angle += diff * SMOOTH_ALPHA
  }
}

const rightSmoother = new Smoother()
const leftSmoother = new Smoother()

/**
 * ビデオ正規化座標(0..1)から、object-fit: cover を考慮した画面ピクセル座標・Three.js座標へ変換する
 */
function mapVideoToScreen(
  lm: NormalizedLandmark,
  viewport: ViewportTransform,
): { pixelX: number; pixelY: number; threeX: number; threeY: number } {
  const { videoWidth, videoHeight, containerWidth, containerHeight, isMirror } = viewport

  const scale = Math.max(containerWidth / videoWidth, containerHeight / videoHeight)
  const renderedW = videoWidth * scale
  const renderedH = videoHeight * scale
  const offsetX = (containerWidth - renderedW) / 2
  const offsetY = (containerHeight - renderedH) / 2

  let pixelX = lm.x * renderedW + offsetX
  const pixelY = lm.y * renderedH + offsetY

  if (isMirror) {
    pixelX = containerWidth - pixelX
  }

  const screenAspect = containerWidth / containerHeight
  const threeX = (pixelX / containerWidth * 2 - 1) * screenAspect
  const threeY = -((pixelY / containerHeight) * 2 - 1)

  return { pixelX, pixelY, threeX, threeY }
}

/**
 * 手首・肘・指先から、手の位置・構え角度・サイズを計算する
 */
function extractHandPose(
  shoulder: NormalizedLandmark | undefined,
  elbow: NormalizedLandmark | undefined,
  wrist: NormalizedLandmark | undefined,
  index: NormalizedLandmark | undefined,
  viewport: ViewportTransform,
  smoother: Smoother,
  isLeftHand: boolean,
): HandPoseInfo {
  if (!wrist || !elbow || (wrist.visibility !== undefined && wrist.visibility < 0.25)) {
    return {
      detected: false,
      threeX: smoother.threeX,
      threeY: smoother.threeY,
      pixelX: smoother.pixelX,
      pixelY: smoother.pixelY,
      angle: smoother.angle,
      scale: smoother.scale,
      score: 0,
    }
  }

  // 手首と肘の画面座標
  const wristCoord = mapVideoToScreen(wrist, viewport)
  const elbowCoord = mapVideoToScreen(elbow, viewport)

  // 腕の方向ベクトル（肘 ➔ 手首）
  let armDx = wristCoord.pixelX - elbowCoord.pixelX
  let armDy = -(wristCoord.pixelY - elbowCoord.pixelY) // Y上向き

  if (index && (index.visibility === undefined || index.visibility > 0.2)) {
    const indexCoord = mapVideoToScreen(index, viewport)
    const handDx = indexCoord.pixelX - wristCoord.pixelX
    const handDy = -(indexCoord.pixelY - wristCoord.pixelY)
    armDx = armDx * 0.35 + handDx * 0.65
    armDy = armDy * 0.35 + handDy * 0.65
  }

  // 刀の回転角（上向き基準からの回転）
  const armAngle = Math.atan2(armDy, armDx)
  // 刀が手から前上方へ向く自然な角度
  const angleOffset = isLeftHand ? -Math.PI * 0.08 : Math.PI * 0.08
  const targetAngle = armAngle - Math.PI / 2 + angleOffset

  // 画面上での腕の長さ（ピクセル）に基づく刀のスケール
  const armLenPx = Math.hypot(wristCoord.pixelX - elbowCoord.pixelX, wristCoord.pixelY - elbowCoord.pixelY)
  // 画面の高さに対する比率（通常腕は画面の約15〜30%程度）
  const targetScale = Math.max(0.4, Math.min(2.0, (armLenPx / (viewport.containerHeight * 0.22))))

  smoother.update(
    wristCoord.threeX,
    wristCoord.threeY,
    wristCoord.pixelX,
    wristCoord.pixelY,
    targetAngle,
    targetScale,
  )

  return {
    detected: true,
    threeX: smoother.threeX,
    threeY: smoother.threeY,
    pixelX: smoother.pixelX,
    pixelY: smoother.pixelY,
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
  container: HTMLElement,
  isMirror: boolean,
  timestampMs: number,
): PoseTrackingResult {
  const containerRect = container.getBoundingClientRect()
  const viewport: ViewportTransform = {
    videoWidth: video.videoWidth || 640,
    videoHeight: video.videoHeight || 480,
    containerWidth: containerRect.width || window.innerWidth,
    containerHeight: containerRect.height || window.innerHeight,
    isMirror,
  }

  const defaultResult: PoseTrackingResult = {
    rightHand: {
      detected: false,
      threeX: (viewport.containerWidth / viewport.containerHeight) * 0.45,
      threeY: -0.25,
      pixelX: viewport.containerWidth * 0.7,
      pixelY: viewport.containerHeight * 0.65,
      angle: -Math.PI / 6,
      scale: 1.0,
      score: 0,
    },
    leftHand: {
      detected: false,
      threeX: -(viewport.containerWidth / viewport.containerHeight) * 0.45,
      threeY: -0.25,
      pixelX: viewport.containerWidth * 0.3,
      pixelY: viewport.containerHeight * 0.65,
      angle: Math.PI / 6,
      scale: 1.0,
      score: 0,
    },
    hasPerson: false,
  }

  if (!landmarker || viewport.videoWidth === 0 || viewport.videoHeight === 0) {
    return defaultResult
  }

  try {
    const result = landmarker.detectForVideo(video, timestampMs)
    if (!result.landmarks || result.landmarks.length === 0) {
      return defaultResult
    }

    const landmarks = result.landmarks[0]
    // 11: left_shoulder, 12: right_shoulder
    // 13: left_elbow, 14: right_elbow
    // 15: left_wrist, 16: right_wrist
    // 19: left_index, 20: right_index
    const leftShoulder = landmarks[11]
    const rightShoulder = landmarks[12]
    const leftElbow = landmarks[13]
    const rightElbow = landmarks[14]
    const leftWrist = landmarks[15]
    const rightWrist = landmarks[16]
    const leftIndex = landmarks[19]
    const rightIndex = landmarks[20]

    // 自撮り（鏡面）モードでは、画面右側に映る腕が解剖学的「左腕」、画面左側が「右腕」になる
    const screenRightIsAnatomicalRight = !isMirror

    const rightHand = screenRightIsAnatomicalRight
      ? extractHandPose(rightShoulder, rightElbow, rightWrist, rightIndex, viewport, rightSmoother, false)
      : extractHandPose(leftShoulder, leftElbow, leftWrist, leftIndex, viewport, rightSmoother, false)

    const leftHand = screenRightIsAnatomicalRight
      ? extractHandPose(leftShoulder, leftElbow, leftWrist, leftIndex, viewport, leftSmoother, true)
      : extractHandPose(rightShoulder, rightElbow, rightWrist, rightIndex, viewport, leftSmoother, true)

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
