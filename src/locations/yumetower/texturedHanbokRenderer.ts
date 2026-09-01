import type { PersonDetectionLocationConfig } from '../types'
import type { CostumeTransform, TrackingPoint } from './personDetection'

type CostumeLayout = NonNullable<PersonDetectionLocationConfig['costumeLayout']>

interface Point {
  x: number
  y: number
}

interface SourceSection {
  top: Point
  bottom: Point
}

interface SleeveMesh {
  side: 'left' | 'right'
  sections: readonly [SourceSection, SourceSection, SourceSection]
}

const PERSON_LEFT_SLEEVE: SleeveMesh = {
  side: 'left',
  sections: [
    { top: { x: 0.68, y: 0.15 }, bottom: { x: 0.67, y: 0.22 } },
    { top: { x: 0.78, y: 0.23 }, bottom: { x: 0.69, y: 0.34 } },
    { top: { x: 0.96, y: 0.35 }, bottom: { x: 0.85, y: 0.43 } },
  ],
}

const PERSON_RIGHT_SLEEVE: SleeveMesh = {
  side: 'right',
  sections: [
    { top: { x: 0.32, y: 0.15 }, bottom: { x: 0.33, y: 0.22 } },
    { top: { x: 0.22, y: 0.23 }, bottom: { x: 0.31, y: 0.34 } },
    { top: { x: 0.04, y: 0.35 }, bottom: { x: 0.15, y: 0.43 } },
  ],
}

const SLEEVE_MESHES = [PERSON_LEFT_SLEEVE, PERSON_RIGHT_SLEEVE] as const

function pointInPixels(point: Point, width: number, height: number): Point {
  return { x: point.x * width, y: point.y * height }
}

function findPoint(points: readonly TrackingPoint[], name: string): Point | undefined {
  const point = points.find((candidate) => candidate.name === name && (candidate.score ?? 0) >= 0.3)
  return point ? { x: point.x, y: point.y } : undefined
}

function sectionCenter(section: SourceSection): Point {
  return {
    x: (section.top.x + section.bottom.x) / 2,
    y: (section.top.y + section.bottom.y) / 2,
  }
}

function normal(a: Point, b: Point): Point {
  const length = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
  return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = orientation(a, b, c)
  const abD = orientation(a, b, d)
  const cdA = orientation(c, d, a)
  const cdB = orientation(c, d, b)
  return abC * abD < 0 && cdA * cdB < 0
}

function clampSegment(origin: Point, target: Point, minimum: number, maximum: number): Point {
  const current = distance(origin, target)
  if (current < 0.001) return { x: origin.x + minimum, y: origin.y }
  const length = Math.min(maximum, Math.max(minimum, current))
  const scale = length / current
  return {
    x: origin.x + (target.x - origin.x) * scale,
    y: origin.y + (target.y - origin.y) * scale,
  }
}

function mappedPoint(
  source: Point,
  imageWidth: number,
  imageHeight: number,
  costume: CostumeTransform,
  layout: CostumeLayout,
): Point {
  const sourceX = source.x * imageWidth
  const sourceY = source.y * imageHeight
  const anchorX = layout.faceHoleCenterXRatio * imageWidth
  const anchorY = layout.faceHoleCenterYRatio * imageHeight
  const localX = (sourceX - anchorX) * (costume.width / imageWidth)
  const localY = (sourceY - anchorY) * (costume.height / imageHeight)
  const cosine = Math.cos(costume.rotation)
  const sine = Math.sin(costume.rotation)
  return {
    x: costume.anchorX + cosine * localX - sine * localY,
    y: costume.anchorY + sine * localX + cosine * localY,
  }
}

function trackedTargetSections(
  mesh: SleeveMesh,
  sourceSections: readonly [SourceSection, SourceSection, SourceSection],
  imageWidth: number,
  imageHeight: number,
  costume: CostumeTransform,
  poseKeypoints: readonly TrackingPoint[],
  layout: CostumeLayout,
): readonly [SourceSection, SourceSection, SourceSection] {
  const shoulder = findPoint(poseKeypoints, `${mesh.side}_shoulder`)
  const elbow = findPoint(poseKeypoints, `${mesh.side}_elbow`)
  const wrist = findPoint(poseKeypoints, `${mesh.side}_wrist`)
  if (!shoulder || !elbow) {
    return sourceSections.map((section) => ({
      top: mappedPoint(section.top, imageWidth, imageHeight, costume, layout),
      bottom: mappedPoint(section.bottom, imageWidth, imageHeight, costume, layout),
    })) as unknown as readonly [SourceSection, SourceSection, SourceSection]
  }

  const estimatedWrist = wrist ?? {
    x: elbow.x + (elbow.x - shoulder.x) * 0.8,
    y: elbow.y + (elbow.y - shoulder.y) * 0.8,
  }
  const sourceShoulder = sourceSections[0]
  const mappedShoulder = {
    top: mappedPoint(sourceShoulder.top, imageWidth, imageHeight, costume, layout),
    bottom: mappedPoint(sourceShoulder.bottom, imageWidth, imageHeight, costume, layout),
  }
  const shoulderCenter = {
    x: (mappedShoulder.top.x + mappedShoulder.bottom.x) / 2,
    y: (mappedShoulder.top.y + mappedShoulder.bottom.y) / 2,
  }
  const mappedCenters = sourceSections.map((section) =>
    mappedPoint(sectionCenter(section), imageWidth, imageHeight, costume, layout),
  )
  const upperLength = distance(mappedCenters[0], mappedCenters[1])
  const lowerLength = distance(mappedCenters[1], mappedCenters[2])
  const targetElbow = clampSegment(
    shoulderCenter,
    elbow,
    upperLength * 0.55,
    upperLength * 1.6,
  )
  const targetWrist = clampSegment(
    targetElbow,
    estimatedWrist,
    lowerLength * 0.55,
    lowerLength * 1.6,
  )
  const centers = [shoulderCenter, targetElbow, targetWrist] as const
  const widths = sourceSections.map((section) => {
    const mappedTop = mappedPoint(section.top, imageWidth, imageHeight, costume, layout)
    const mappedBottom = mappedPoint(section.bottom, imageWidth, imageHeight, costume, layout)
    return Math.hypot(mappedBottom.x - mappedTop.x, mappedBottom.y - mappedTop.y)
  })

  const targetSections: SourceSection[] = [mappedShoulder]
  for (let index = 1; index < centers.length; index += 1) {
    const center = centers[index]
    const before = centers[index - 1]
    const after = centers[Math.min(centers.length - 1, index + 1)]
    const rawNormal = normal(before, after)
    const candidate = {
      top: {
        x: center.x + rawNormal.x * widths[index] * 0.5,
        y: center.y + rawNormal.y * widths[index] * 0.5,
      },
      bottom: {
        x: center.x - rawNormal.x * widths[index] * 0.5,
        y: center.y - rawNormal.y * widths[index] * 0.5,
      },
    }
    const previous = targetSections[index - 1]
    const directCost =
      distance(previous.top, candidate.top) + distance(previous.bottom, candidate.bottom)
    const swappedCost =
      distance(previous.top, candidate.bottom) + distance(previous.bottom, candidate.top)
    const directCrosses = segmentsCross(
      previous.top,
      candidate.top,
      previous.bottom,
      candidate.bottom,
    )
    const swappedCrosses = segmentsCross(
      previous.top,
      candidate.bottom,
      previous.bottom,
      candidate.top,
    )
    targetSections.push(
      !directCrosses && (swappedCrosses || directCost <= swappedCost)
        ? candidate
        : { top: candidate.bottom, bottom: candidate.top },
    )
  }
  return targetSections as unknown as readonly [SourceSection, SourceSection, SourceSection]
}

function drawTexturedTriangle(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  source: readonly [Point, Point, Point],
  target: readonly [Point, Point, Point],
) {
  const [s0, s1, s2] = source
  const [d0, d1, d2] = target
  const denominator =
    s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y)
  if (Math.abs(denominator) < 0.001) return
  const a =
    (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) /
    denominator
  const b =
    (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) /
    denominator
  const c =
    (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) /
    denominator
  const d =
    (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) /
    denominator
  const e =
    (d0.x * (s1.x * s2.y - s2.x * s1.y) +
      d1.x * (s2.x * s0.y - s0.x * s2.y) +
      d2.x * (s0.x * s1.y - s1.x * s0.y)) /
    denominator
  const f =
    (d0.y * (s1.x * s2.y - s2.x * s1.y) +
      d1.y * (s2.x * s0.y - s0.x * s2.y) +
      d2.y * (s0.x * s1.y - s1.x * s0.y)) /
    denominator

  context.save()
  context.beginPath()
  context.moveTo(d0.x, d0.y)
  context.lineTo(d1.x, d1.y)
  context.lineTo(d2.x, d2.y)
  context.closePath()
  context.clip()
  context.transform(a, b, c, d, e, f)
  context.drawImage(image, 0, 0)
  context.restore()
}

function drawSleeveMesh(
  context: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  mesh: SleeveMesh,
  costume: CostumeTransform,
  poseKeypoints: readonly TrackingPoint[],
  layout: CostumeLayout,
) {
  const sourceSections = mesh.sections.map((section) => ({
    top: pointInPixels(section.top, image.width, image.height),
    bottom: pointInPixels(section.bottom, image.width, image.height),
  })) as unknown as readonly [SourceSection, SourceSection, SourceSection]
  const targetSections = trackedTargetSections(
    mesh,
    mesh.sections,
    image.width,
    image.height,
    costume,
    poseKeypoints,
    layout,
  )

  for (let index = 0; index < 2; index += 1) {
    const sourceStart = sourceSections[index]
    const sourceEnd = sourceSections[index + 1]
    const targetStart = targetSections[index]
    const targetEnd = targetSections[index + 1]
    drawTexturedTriangle(
      context,
      image,
      [sourceStart.top, sourceStart.bottom, sourceEnd.top],
      [targetStart.top, targetStart.bottom, targetEnd.top],
    )
    drawTexturedTriangle(
      context,
      image,
      [sourceStart.bottom, sourceEnd.bottom, sourceEnd.top],
      [targetStart.bottom, targetEnd.bottom, targetEnd.top],
    )
  }
}

export function createTexturedHanbokTorso(source: HTMLCanvasElement): HTMLCanvasElement {
  const torso = document.createElement('canvas')
  torso.width = source.width
  torso.height = source.height
  const context = torso.getContext('2d')
  if (!context) throw new Error('2D context is not available')
  context.drawImage(source, 0, 0)
  context.globalCompositeOperation = 'destination-out'

  for (const mesh of SLEEVE_MESHES) {
    const [shoulder, elbow, cuff] = mesh.sections
    const polygon = [
      shoulder.top,
      elbow.top,
      cuff.top,
      cuff.bottom,
      elbow.bottom,
      shoulder.bottom,
    ]
    context.beginPath()
    polygon.forEach((point, index) => {
      const pixel = pointInPixels(point, source.width, source.height)
      if (index === 0) context.moveTo(pixel.x, pixel.y)
      else context.lineTo(pixel.x, pixel.y)
    })
    context.closePath()
    context.fill()
  }
  context.globalCompositeOperation = 'source-over'
  return torso
}

export function drawTexturedHanbok(
  context: CanvasRenderingContext2D,
  costumeImage: HTMLCanvasElement,
  torsoImage: HTMLCanvasElement,
  costume: CostumeTransform,
  poseKeypoints: readonly TrackingPoint[],
  layout: CostumeLayout,
) {
  // Draw the torso first, then let each tracked sleeve overlap the shoulder
  // edge. This prevents the transparent torso cutout from leaving a seam
  // between the fixed bodice and the moving sleeves.
  context.save()
  context.translate(costume.anchorX, costume.anchorY)
  context.rotate(costume.rotation)
  context.drawImage(
    torsoImage,
    -costume.width * layout.faceHoleCenterXRatio,
    -costume.height * layout.faceHoleCenterYRatio,
    costume.width,
    costume.height,
  )
  context.restore()

  for (const mesh of SLEEVE_MESHES) {
    drawSleeveMesh(context, costumeImage, mesh, costume, poseKeypoints, layout)
  }
}
