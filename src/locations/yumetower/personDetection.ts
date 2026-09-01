export interface DetectionPrediction {
  class: string
  score: number
  bbox: [number, number, number, number]
}

export interface OverlayPlacement {
  x: number
  y: number
  width: number
  height: number
}

export interface FaceBox {
  xMin: number
  yMin: number
  width: number
  height: number
}

export interface TrackingPoint {
  x: number
  y: number
  score?: number
  name?: string
}

export interface CostumeTransform {
  anchorX: number
  anchorY: number
  width: number
  height: number
  rotation: number
}

export interface CostumeBodyFitOptions {
  shoulderWidthRatio: number
  torsoHeightRatio: number
  blend: number
}

export interface TrackedFace {
  box: FaceBox
  keypoints: TrackingPoint[]
}

export interface TrackedArm {
  shoulder: TrackingPoint
  end: TrackingPoint
}

export interface FixedBrandLayout {
  image: OverlayPlacement
  textX: number
  textBaselineY: number
  fontSize: number
}

const OVERLAY_HEIGHT_RATIOS = [0.3, 0.24, 0.18]
const OVERLAY_MAX_WIDTH_RATIO = 0.3
const FRAME_MARGIN_RATIO = 0.04
const OBSTACLE_THRESHOLD = 0.45
const COSTUME_FACE_HOLE_CENTER_X_RATIO = 0.5
const COSTUME_FACE_HOLE_CENTER_Y_RATIO = 0.315
const COSTUME_FACE_HOLE_WIDTH_RATIO = 0.36
const COSTUME_FACE_HOLE_HEIGHT_RATIO = 0.27
const FACE_HOLE_PADDING_RATIO = 1.25
const SNOW_FACE_HOLE_SCALE = 1.02
const MIN_KEYPOINT_SCORE = 0.3

export function findBestPerson(
  predictions: readonly DetectionPrediction[],
  threshold: number,
): DetectionPrediction | undefined {
  return predictions
    .filter((prediction) => prediction.class === 'person' && prediction.score >= threshold)
    .sort((a, b) => b.score - a.score)[0]
}

export function findPeople(
  predictions: readonly DetectionPrediction[],
  threshold: number,
): DetectionPrediction[] {
  return predictions.filter(
    (prediction) => prediction.class === 'person' && prediction.score >= threshold,
  )
}

function intersectionArea(a: OverlayPlacement, b: DetectionPrediction['bbox']): number {
  const [bx, by, bWidth, bHeight] = b
  const width = Math.max(0, Math.min(a.x + a.width, bx + bWidth) - Math.max(a.x, bx))
  const height = Math.max(0, Math.min(a.y + a.height, by + bHeight) - Math.max(a.y, by))
  return width * height
}

export function findEmptyOverlayPlacement(
  predictions: readonly DetectionPrediction[],
  frameWidth: number,
  frameHeight: number,
  imageAspectRatio: number,
): OverlayPlacement {
  const marginX = frameWidth * FRAME_MARGIN_RATIO
  const marginY = frameHeight * FRAME_MARGIN_RATIO
  const obstacles = predictions.filter((prediction) => prediction.score >= OBSTACLE_THRESHOLD)

  const candidates = OVERLAY_HEIGHT_RATIOS.flatMap((heightRatio) => {
    let height = frameHeight * heightRatio
    let width = height * imageAspectRatio
    const maxWidth = frameWidth * OVERLAY_MAX_WIDTH_RATIO
    if (width > maxWidth) {
      width = maxWidth
      height = width / imageAspectRatio
    }
    const xPositions = [marginX, (frameWidth - width) / 2, frameWidth - width - marginX]
    const yPositions = [marginY, (frameHeight - height) / 2, frameHeight - height - marginY]
    return yPositions.flatMap((y) =>
      xPositions.map((x): OverlayPlacement => ({ x, y, width, height })),
    )
  })

  const occupancyScore = (placement: OverlayPlacement) =>
    obstacles.reduce((total, obstacle) => {
      const personWeight = obstacle.class === 'person' ? 20 : 1
      const occupiedRatio = intersectionArea(placement, obstacle.bbox) / (placement.width * placement.height)
      return total + occupiedRatio * obstacle.score * personWeight
    }, 0)

  return candidates.reduce((best, candidate) =>
    occupancyScore(candidate) < occupancyScore(best) ? candidate : best,
  )
}

function isExteriorWhite(data: Uint8ClampedArray, pixelIndex: number): boolean {
  const offset = pixelIndex * 4
  const red = data[offset]
  const green = data[offset + 1]
  const blue = data[offset + 2]
  return red >= 235 && green >= 235 && blue >= 235 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 18
}

export function removeConnectedWhiteBackground(
  imageData: ImageData,
  interiorSeeds: readonly { xRatio: number; yRatio: number }[] = [],
): ImageData {
  const { data, width, height } = imageData
  const visited = new Uint8Array(width * height)
  const queue: number[] = []

  const enqueue = (pixelIndex: number) => {
    if (!visited[pixelIndex] && isExteriorWhite(data, pixelIndex)) {
      visited[pixelIndex] = 1
      queue.push(pixelIndex)
    }
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x)
    enqueue((height - 1) * width + x)
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width)
    enqueue(y * width + width - 1)
  }
  for (const seed of interiorSeeds) {
    const x = Math.min(width - 1, Math.max(0, Math.round(seed.xRatio * (width - 1))))
    const y = Math.min(height - 1, Math.max(0, Math.round(seed.yRatio * (height - 1))))
    enqueue(y * width + x)
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const pixelIndex = queue[cursor]
    data[pixelIndex * 4 + 3] = 0
    const x = pixelIndex % width
    const y = Math.floor(pixelIndex / width)
    if (x > 0) enqueue(pixelIndex - 1)
    if (x < width - 1) enqueue(pixelIndex + 1)
    if (y > 0) enqueue(pixelIndex - width)
    if (y < height - 1) enqueue(pixelIndex + width)
  }

  return imageData
}

export function getCostumePlacement(
  personBbox: DetectionPrediction['bbox'],
  costumeAspectRatio: number,
  faceBox?: FaceBox,
): OverlayPlacement {
  const [x, y, width, height] = personBbox
  if (faceBox) {
    return getFaceAlignedCostumePlacement(faceBox, costumeAspectRatio)
  }

  const costumeHeight = height * 1.2
  const costumeWidth = costumeHeight * costumeAspectRatio
  return {
    x: x + width / 2 - costumeWidth / 2,
    y: y + height * 0.03,
    width: costumeWidth,
    height: costumeHeight,
  }
}

export function getFaceAlignedCostumePlacement(
  faceBox: FaceBox,
  costumeAspectRatio: number,
): OverlayPlacement {
  const widthFromFace = (faceBox.width * FACE_HOLE_PADDING_RATIO) / COSTUME_FACE_HOLE_WIDTH_RATIO
  const widthFromFaceHeight =
    (faceBox.height * FACE_HOLE_PADDING_RATIO * costumeAspectRatio) /
    COSTUME_FACE_HOLE_HEIGHT_RATIO
  const costumeWidth = Math.max(widthFromFace, widthFromFaceHeight)
  const costumeHeight = costumeWidth / costumeAspectRatio
  const faceCenterX = faceBox.xMin + faceBox.width / 2
  const faceCenterY = faceBox.yMin + faceBox.height / 2
  return {
    x: faceCenterX - costumeWidth * COSTUME_FACE_HOLE_CENTER_X_RATIO,
    y: faceCenterY - costumeHeight * COSTUME_FACE_HOLE_CENTER_Y_RATIO,
    width: costumeWidth,
    height: costumeHeight,
  }
}

export function findFaceForPerson(
  faces: readonly FaceBox[],
  personBbox: DetectionPrediction['bbox'],
): FaceBox | undefined {
  const [personX, personY, personWidth, personHeight] = personBbox
  return faces.find((face) => {
    const centerX = face.xMin + face.width / 2
    const centerY = face.yMin + face.height / 2
    return (
      centerX >= personX &&
      centerX <= personX + personWidth &&
      centerY >= personY &&
      centerY <= personY + personHeight
    )
  })
}

export function smoothFaceBox(previous: FaceBox, current: FaceBox, alpha = 0.35): FaceBox {
  const blend = (oldValue: number, newValue: number) => oldValue + (newValue - oldValue) * alpha
  return {
    xMin: blend(previous.xMin, current.xMin),
    yMin: blend(previous.yMin, current.yMin),
    width: blend(previous.width, current.width),
    height: blend(previous.height, current.height),
  }
}

function pointByName(points: readonly TrackingPoint[], name: string): TrackingPoint | undefined {
  return points.find((point) => point.name === name && (point.score ?? 1) >= MIN_KEYPOINT_SCORE)
}

export function getTrackedArm(
  points: readonly TrackingPoint[],
  side: 'left' | 'right',
): TrackedArm | undefined {
  const shoulder = pointByName(points, `${side}_shoulder`)
  const wrist = pointByName(points, `${side}_wrist`)
  const elbow = pointByName(points, `${side}_elbow`)
  const end = wrist ?? elbow
  return shoulder && end ? { shoulder, end } : undefined
}

function midpoint(a?: TrackingPoint, b?: TrackingPoint): TrackingPoint | undefined {
  if (!a || !b) return undefined
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function horizontalLineAngle(a: TrackingPoint, b: TrackingPoint): number {
  const [left, right] = a.x <= b.x ? [a, b] : [b, a]
  return Math.atan2(right.y - left.y, right.x - left.x)
}

/**
 * Produces the rigid transform used by a SNOW-style filter. The face opening is
 * the transform anchor, while eyes control scale/rotation and shoulders add a
 * small amount of body tilt without pulling the opening away from the face.
 */
export function getSnowCostumeTransform(
  faceBox: FaceBox,
  faceKeypoints: readonly TrackingPoint[],
  poseKeypoints: readonly TrackingPoint[],
  costumeAspectRatio: number,
  faceHoleWidthRatio = COSTUME_FACE_HOLE_WIDTH_RATIO,
  faceScale = SNOW_FACE_HOLE_SCALE,
): CostumeTransform {
  // The named points support the lightweight detector and the numeric indices
  // support MediaPipe FaceMesh (468 landmarks), which is used by the camera.
  const rightEye = pointByName(faceKeypoints, 'rightEye') ?? midpoint(faceKeypoints[33], faceKeypoints[133])
  const leftEye = pointByName(faceKeypoints, 'leftEye') ?? midpoint(faceKeypoints[362], faceKeypoints[263])
  const rightEar = pointByName(faceKeypoints, 'rightEarTragion') ?? faceKeypoints[234]
  const leftEar = pointByName(faceKeypoints, 'leftEarTragion') ?? faceKeypoints[454]
  const leftShoulder = pointByName(poseKeypoints, 'left_shoulder')
  const rightShoulder = pointByName(poseKeypoints, 'right_shoulder')

  const faceCenterX = rightEar && leftEar
    ? (rightEar.x + leftEar.x) / 2
    : faceBox.xMin + faceBox.width / 2
  const faceCenterY = faceBox.yMin + faceBox.height / 2

  const eyeDistance = rightEye && leftEye
    ? Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y)
    : faceBox.width * 0.43
  const faceWidth = Math.max(faceBox.width, eyeDistance / 0.43)
  const costumeWidth = (faceWidth * faceScale) / faceHoleWidthRatio
  const costumeHeight = costumeWidth / costumeAspectRatio

  const eyeAngle = rightEye && leftEye
    ? horizontalLineAngle(rightEye, leftEye)
    : 0
  const shoulderAngle = leftShoulder && rightShoulder
    ? horizontalLineAngle(leftShoulder, rightShoulder)
    : eyeAngle
  const rotation = eyeAngle * 0.75 + shoulderAngle * 0.25

  return {
    anchorX: faceCenterX,
    anchorY: faceCenterY,
    width: costumeWidth,
    height: costumeHeight,
    rotation,
  }
}

/**
 * Refines the face-anchored transform with MoveNet shoulders and hips. The
 * face remains the primary anchor, while garment width and height follow the
 * visible upper body. Missing body points safely preserve the face-only fit.
 */
export function fitCostumeTransformToBody(
  faceTransform: CostumeTransform,
  poseKeypoints: readonly TrackingPoint[],
  costumeAspectRatio: number,
  options: CostumeBodyFitOptions,
): CostumeTransform {
  const leftShoulder = pointByName(poseKeypoints, 'left_shoulder')
  const rightShoulder = pointByName(poseKeypoints, 'right_shoulder')
  if (!leftShoulder || !rightShoulder) return faceTransform

  const blend = Math.min(1, Math.max(0, options.blend))
  const blendValue = (faceValue: number, bodyValue: number) =>
    faceValue + (bodyValue - faceValue) * blend
  const clampToFaceScale = (value: number, faceValue: number) =>
    Math.min(faceValue * 1.45, Math.max(faceValue * 0.68, value))

  const shoulderWidth = Math.hypot(
    leftShoulder.x - rightShoulder.x,
    leftShoulder.y - rightShoulder.y,
  )
  const bodyWidth = shoulderWidth / options.shoulderWidthRatio
  const width = blendValue(
    faceTransform.width,
    clampToFaceScale(bodyWidth, faceTransform.width),
  )

  const shoulderCenter = midpoint(leftShoulder, rightShoulder)!
  const leftHip = pointByName(poseKeypoints, 'left_hip')
  const rightHip = pointByName(poseKeypoints, 'right_hip')
  const hipCenter = midpoint(leftHip, rightHip)
  const proportionalHeight = width / costumeAspectRatio
  const bodyHeight = hipCenter
    ? Math.hypot(hipCenter.x - shoulderCenter.x, hipCenter.y - shoulderCenter.y) /
      options.torsoHeightRatio
    : proportionalHeight
  const height = blendValue(
    proportionalHeight,
    clampToFaceScale(bodyHeight, faceTransform.height),
  )

  return {
    ...faceTransform,
    anchorX: faceTransform.anchorX + (shoulderCenter.x - faceTransform.anchorX) * 0.12,
    width,
    height,
  }
}

export function smoothCostumeTransform(
  previous: CostumeTransform,
  current: CostumeTransform,
  alpha = 0.28,
): CostumeTransform {
  const blend = (oldValue: number, newValue: number) => oldValue + (newValue - oldValue) * alpha
  return {
    anchorX: blend(previous.anchorX, current.anchorX),
    anchorY: blend(previous.anchorY, current.anchorY),
    width: blend(previous.width, current.width),
    height: blend(previous.height, current.height),
    rotation: blend(previous.rotation, current.rotation),
  }
}

export function poseToPersonPrediction(
  keypoints: readonly TrackingPoint[],
): DetectionPrediction | undefined {
  const visible = keypoints.filter((point) => (point.score ?? 0) >= MIN_KEYPOINT_SCORE)
  if (visible.length < 4) return undefined
  const minX = Math.min(...visible.map((point) => point.x))
  const maxX = Math.max(...visible.map((point) => point.x))
  const minY = Math.min(...visible.map((point) => point.y))
  const maxY = Math.max(...visible.map((point) => point.y))
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  return {
    class: 'person',
    score: 1,
    bbox: [minX - width * 0.15, minY - height * 0.1, width * 1.3, height * 1.2],
  }
}

/**
 * MoveNet already supplies five reliable facial landmarks. Use them as a
 * fallback when FaceMesh misses a valid face (glasses and backlighting are
 * common causes), so the filter remains responsive like a camera app.
 */
export function poseToTrackedFace(
  keypoints: readonly TrackingPoint[],
): TrackedFace | undefined {
  const nose = pointByName(keypoints, 'nose')
  const leftEye = pointByName(keypoints, 'left_eye')
  const rightEye = pointByName(keypoints, 'right_eye')
  const leftEar = pointByName(keypoints, 'left_ear')
  const rightEar = pointByName(keypoints, 'right_ear')
  if (!nose || !leftEye || !rightEye) return undefined

  const eyeDistance = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y)
  if (eyeDistance < 4) return undefined
  const earDistance = leftEar && rightEar
    ? Math.hypot(leftEar.x - rightEar.x, leftEar.y - rightEar.y)
    : 0
  const width = Math.max(eyeDistance / 0.43, earDistance * 1.08)
  const height = width * 1.18
  const eyeCenterX = (leftEye.x + rightEye.x) / 2
  const eyeCenterY = (leftEye.y + rightEye.y) / 2
  const centerX = eyeCenterX * 0.7 + nose.x * 0.3
  const centerY = eyeCenterY + height * 0.17

  return {
    box: {
      xMin: centerX - width / 2,
      yMin: centerY - height / 2,
      width,
      height,
    },
    keypoints: [
      { ...rightEye, name: 'rightEye' },
      { ...leftEye, name: 'leftEye' },
      { ...nose, name: 'noseTip' },
      ...(rightEar ? [{ ...rightEar, name: 'rightEarTragion' }] : []),
      ...(leftEar ? [{ ...leftEar, name: 'leftEarTragion' }] : []),
    ],
  }
}

export function getFixedBrandLayout(
  frameWidth: number,
  frameHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  imageAspectRatio: number,
): FixedBrandLayout {
  const coverScale = Math.max(viewportWidth / frameWidth, viewportHeight / frameHeight)
  const visibleWidth = viewportWidth / coverScale
  const visibleHeight = viewportHeight / coverScale
  const visibleLeft = (frameWidth - visibleWidth) / 2
  const visibleTop = (frameHeight - visibleHeight) / 2
  const margin = Math.max(12, visibleHeight * 0.035)
  const fontSize = Math.max(18, visibleHeight * 0.032)

  let imageHeight = visibleHeight * 0.2
  let imageWidth = imageHeight * imageAspectRatio
  const maxImageWidth = visibleWidth * 0.22
  if (imageWidth > maxImageWidth) {
    imageWidth = maxImageWidth
    imageHeight = imageWidth / imageAspectRatio
  }

  const textBaselineY = visibleTop + visibleHeight - margin
  return {
    image: {
      x: visibleLeft + margin,
      y: textBaselineY - fontSize * 1.35 - imageHeight,
      width: imageWidth,
      height: imageHeight,
    },
    textX: visibleLeft + margin,
    textBaselineY,
    fontSize,
  }
}
