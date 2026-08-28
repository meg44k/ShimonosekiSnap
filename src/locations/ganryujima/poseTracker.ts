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
  // 把持（握り）判定 & 確信度
  isGrasping: boolean
  graspConfidence: number
  // 指の前面オクルージョン用領域 (ピクセル)
  fingerOcclusion: {
    cx: number
    cy: number
    rx: number
    ry: number
    angle: number
  } | null
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
export function mapVideoToScreen(
  lm: { x: number; y: number },
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
 * 手首・肘・親指・人差し指・小指から、手のひら（拳）の位置・把持状態・構え角度・サイズ・オクルージョン領域を計算
 */
function extractHandPose(
  shoulder: NormalizedLandmark | undefined,
  elbow: NormalizedLandmark | undefined,
  wrist: NormalizedLandmark | undefined,
  index: NormalizedLandmark | undefined,
  pinky: NormalizedLandmark | undefined,
  thumb: NormalizedLandmark | undefined,
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
      isGrasping: false,
      graspConfidence: 0,
      fingerOcclusion: null,
      score: 0,
    }
  }

  // 1. 手首と指先の位置から手のひら（拳の中央）を計算
  let palmNorm = { x: wrist.x, y: wrist.y }
  let graspSpread = 1.0

  if (index && pinky && (index.visibility === undefined || index.visibility > 0.2)) {
    const knucklesX = (index.x + pinky.x) * 0.5
    const knucklesY = (index.y + pinky.y) * 0.5
    palmNorm = {
      x: wrist.x * 0.38 + knucklesX * 0.62,
      y: wrist.y * 0.38 + knucklesY * 0.62,
    }
    // 指先と手首の開き具合（把持状態判定）
    const handSpan = Math.hypot(index.x - wrist.x, index.y - wrist.y)
    const armSpan = Math.hypot(wrist.x - elbow.x, wrist.y - elbow.y) || 1
    graspSpread = handSpan / armSpan
  } else if (index && (index.visibility === undefined || index.visibility > 0.2)) {
    palmNorm = {
      x: wrist.x * 0.42 + index.x * 0.58,
      y: wrist.y * 0.42 + index.y * 0.58,
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

  const isGrasping = graspSpread < 0.55
  const graspConfidence = Math.max(0, Math.min(1, (0.7 - graspSpread) * 3))

  // 2. 画面ピクセル座標とThree.js座標の変換
  const palmCoord = mapVideoToScreen(palmNorm, viewport)
  const elbowCoord = mapVideoToScreen(elbow, viewport)
  const wristCoord = mapVideoToScreen(wrist, viewport)

  // 3. 幾何学的角度拘束（腕ベクトル + 親指/人差し指の握りベクトル）
  let armDx = palmCoord.pixelX - elbowCoord.pixelX
  let armDy = -(palmCoord.pixelY - elbowCoord.pixelY) // Y上向き

  if (index && (index.visibility === undefined || index.visibility > 0.2)) {
    const indexCoord = mapVideoToScreen(index, viewport)
    const handDx = indexCoord.pixelX - wristCoord.pixelX
    const handDy = -(indexCoord.pixelY - wristCoord.pixelY)
    // 拳の向き（親指・人差し指側）の寄与を強くして手首のひねりに追従
    armDx = armDx * 0.25 + handDx * 0.75
    armDy = armDy * 0.25 + handDy * 0.75
  }

  const armAngle = Math.atan2(armDy, armDx)
  const angleOffset = isLeftHand ? -Math.PI * 0.04 : Math.PI * 0.04
  const targetAngle = armAngle - Math.PI / 2 + angleOffset

  // 4. スケール
  const armLenPx = Math.hypot(wristCoord.pixelX - elbowCoord.pixelX, wristCoord.pixelY - elbowCoord.pixelY)
  const targetScale = Math.max(0.45, Math.min(2.0, armLenPx / (viewport.containerHeight * 0.22)))

  smoother.update(
    palmCoord.threeX,
    palmCoord.threeY,
    palmCoord.pixelX,
    palmCoord.pixelY,
    targetAngle,
    targetScale,
  )

  // 5. 指の前面オクルージョン領域（柄を握り込む指のマスク楕円）
  const fingerRadiusPx = Math.max(16, Math.min(50, armLenPx * 0.16))
  const fingerOcclusion = {
    cx: smoother.pixelX,
    cy: smoother.pixelY,
    rx: fingerRadiusPx * 1.1,
    ry: fingerRadiusPx * 0.85,
    angle: smoother.angle,
  }

  return {
    detected: true,
    threeX: smoother.threeX,
    threeY: smoother.threeY,
    pixelX: smoother.pixelX,
    pixelY: smoother.pixelY,
    angle: smoother.angle,
    scale: smoother.scale,
    isGrasping,
    graspConfidence,
    fingerOcclusion,
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
      isGrasping: false,
      graspConfidence: 0,
      fingerOcclusion: null,
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
      isGrasping: false,
      graspConfidence: 0,
      fingerOcclusion: null,
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
    // 17: left_pinky, 18: right_pinky
    // 19: left_index, 20: right_index
    // 21: left_thumb, 22: right_thumb
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

    const screenRightIsAnatomicalRight = !isMirror

    const rightHand = screenRightIsAnatomicalRight
      ? extractHandPose(rightShoulder, rightElbow, rightWrist, rightIndex, rightPinky, rightThumb, viewport, rightSmoother, false)
      : extractHandPose(leftShoulder, leftElbow, leftWrist, leftIndex, leftPinky, leftThumb, viewport, rightSmoother, false)

    const leftHand = screenRightIsAnatomicalRight
      ? extractHandPose(leftShoulder, leftElbow, leftWrist, leftIndex, leftPinky, leftThumb, viewport, leftSmoother, true)
      : extractHandPose(rightShoulder, rightElbow, rightWrist, rightIndex, rightPinky, rightThumb, viewport, leftSmoother, true)

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
