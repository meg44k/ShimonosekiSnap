import { describe, expect, it } from 'vitest'
import {
  findBestPerson,
  fitCostumeTransformToBody,
  findEmptyOverlayPlacement,
  findFaceForPerson,
  findPeople,
  getFaceAlignedCostumePlacement,
  getFixedBrandLayout,
  getTrackedArm,
  getCostumePlacement,
  getSnowCostumeTransform,
  poseToPersonPrediction,
  poseToTrackedFace,
  removeConnectedWhiteBackground,
  smoothCostumeTransform,
  smoothFaceBox,
} from './personDetection'

describe('findBestPerson', () => {
  it('returns the highest scoring person above the threshold', () => {
    const result = findBestPerson(
      [
        { class: 'person', score: 0.65, bbox: [0, 0, 10, 20] },
        { class: 'cat', score: 0.99, bbox: [0, 0, 10, 10] },
        { class: 'person', score: 0.91, bbox: [10, 10, 20, 40] },
      ],
      0.6,
    )

    expect(result?.score).toBe(0.91)
  })

  it('returns undefined when no person reaches the threshold', () => {
    expect(
      findBestPerson([{ class: 'person', score: 0.59, bbox: [0, 0, 10, 20] }], 0.6),
    ).toBeUndefined()
  })
})

describe('findPeople', () => {
  it('returns every person above the threshold', () => {
    const people = findPeople(
      [
        { class: 'person', score: 0.8, bbox: [0, 0, 10, 20] },
        { class: 'person', score: 0.7, bbox: [20, 0, 10, 20] },
        { class: 'dog', score: 0.9, bbox: [0, 0, 10, 10] },
      ],
      0.6,
    )
    expect(people).toHaveLength(2)
  })
})

describe('findEmptyOverlayPlacement', () => {
  it('places the character away from a detected person', () => {
    const person = { class: 'person', score: 0.95, bbox: [0, 0, 700, 1000] as [number, number, number, number] }
    const placement = findEmptyOverlayPlacement([person], 1000, 1000, 0.75)

    const overlapsHorizontally = placement.x < 700 && placement.x + placement.width > 0
    expect(overlapsHorizontally).toBe(false)
  })
})

describe('removeConnectedWhiteBackground', () => {
  it('removes exterior white while preserving enclosed white details', () => {
    const width = 5
    const height = 5
    const data = new Uint8ClampedArray(width * height * 4).fill(255)
    const setPixel = (x: number, y: number, color: [number, number, number, number]) => {
      data.set(color, (y * width + x) * 4)
    }

    for (let x = 1; x <= 3; x += 1) {
      setPixel(x, 1, [0, 0, 0, 255])
      setPixel(x, 3, [0, 0, 0, 255])
    }
    setPixel(1, 2, [0, 0, 0, 255])
    setPixel(3, 2, [0, 0, 0, 255])

    const result = removeConnectedWhiteBackground({ data, width, height } as ImageData)
    expect(result.data[3]).toBe(0)
    expect(result.data[(2 * width + 2) * 4 + 3]).toBe(255)
  })


  it('removes an enclosed background region when an interior seed is supplied', () => {
    const width = 5
    const height = 5
    const data = new Uint8ClampedArray(width * height * 4).fill(255)
    for (let x = 1; x <= 3; x += 1) {
      data.set([0, 0, 0, 255], (1 * width + x) * 4)
      data.set([0, 0, 0, 255], (3 * width + x) * 4)
    }
    data.set([0, 0, 0, 255], (2 * width + 1) * 4)
    data.set([0, 0, 0, 255], (2 * width + 3) * 4)

    const result = removeConnectedWhiteBackground(
      { data, width, height } as ImageData,
      [{ xRatio: 0.5, yRatio: 0.5 }],
    )
    expect(result.data[(2 * width + 2) * 4 + 3]).toBe(0)
  })
})

describe('getCostumePlacement', () => {
  it('centers the costume over the person and aligns the face opening', () => {
    const placement = getCostumePlacement([100, 200, 200, 600], 0.75)
    expect(placement.x + placement.width / 2).toBe(200)
    expect(placement.y).toBe(218)
    expect(placement.height).toBe(720)
  })

  it('aligns the costume face hole to the detected face center', () => {
    const face = { xMin: 120, yMin: 80, width: 160, height: 180 }
    const placement = getCostumePlacement([80, 40, 240, 700], 0.75, face)
    const holeCenterX = placement.x + placement.width * 0.5
    const holeCenterY = placement.y + placement.height * 0.315

    expect(holeCenterX).toBe(200)
    expect(holeCenterY).toBe(170)
  })
})

describe('getFaceAlignedCostumePlacement', () => {
  it('uses the face as the only alignment source', () => {
    const face = { xMin: 120, yMin: 80, width: 160, height: 180 }
    const placement = getFaceAlignedCostumePlacement(face, 0.75)

    expect(placement.x + placement.width * 0.5).toBe(200)
    expect(placement.y + placement.height * 0.315).toBe(170)
  })
})

describe('findFaceForPerson', () => {
  it('matches only a face whose center is inside the person bounds', () => {
    const outsideFace = { xMin: 500, yMin: 50, width: 100, height: 100 }
    const insideFace = { xMin: 120, yMin: 80, width: 100, height: 100 }

    expect(findFaceForPerson([outsideFace, insideFace], [100, 40, 240, 700])).toBe(insideFace)
  })
})

describe('smoothFaceBox', () => {
  it('moves partway toward the latest detected face to reduce jitter', () => {
    const previous = { xMin: 100, yMin: 100, width: 100, height: 100 }
    const current = { xMin: 120, yMin: 80, width: 120, height: 80 }

    expect(smoothFaceBox(previous, current, 0.5)).toEqual({
      xMin: 110,
      yMin: 90,
      width: 110,
      height: 90,
    })
  })
})

describe('SNOW-style costume tracking', () => {
  it('tracks each arm from the shoulder to the wrist', () => {
    const arm = getTrackedArm(
      [
        { name: 'left_shoulder', x: 100, y: 120, score: 0.9 },
        { name: 'left_elbow', x: 130, y: 180, score: 0.9 },
        { name: 'left_wrist', x: 180, y: 220, score: 0.9 },
      ],
      'left',
    )

    expect(arm?.shoulder).toMatchObject({ x: 100, y: 120 })
    expect(arm?.end).toMatchObject({ x: 180, y: 220 })
  })

  it('falls back to the elbow when the wrist is not visible', () => {
    const arm = getTrackedArm(
      [
        { name: 'right_shoulder', x: 200, y: 120, score: 0.9 },
        { name: 'right_elbow', x: 240, y: 190, score: 0.9 },
      ],
      'right',
    )

    expect(arm?.end).toMatchObject({ x: 240, y: 190 })
  })

  it('anchors the face opening to the detected face and follows eye rotation', () => {
    const transform = getSnowCostumeTransform(
      { xMin: 100, yMin: 60, width: 120, height: 140 },
      [
        { name: 'rightEye', x: 130, y: 100 },
        { name: 'leftEye', x: 190, y: 110 },
        { name: 'rightEarTragion', x: 105, y: 120 },
        { name: 'leftEarTragion', x: 215, y: 120 },
      ],
      [],
      0.75,
    )

    expect(transform.anchorX).toBe(160)
    expect(transform.anchorY).toBe(130)
    expect(transform.rotation).toBeGreaterThan(0)
  })

  it('supports costume-specific face opening proportions', () => {
    const defaultTransform = getSnowCostumeTransform(
      { xMin: 100, yMin: 60, width: 120, height: 140 },
      [],
      [],
      2 / 3,
    )
    const hanbokTransform = getSnowCostumeTransform(
      { xMin: 100, yMin: 60, width: 120, height: 140 },
      [],
      [],
      2 / 3,
      0.22,
      1.08,
    )

    expect(hanbokTransform.width).toBeGreaterThan(defaultTransform.width)
    expect(hanbokTransform.anchorX).toBe(defaultTransform.anchorX)
    expect(hanbokTransform.anchorY).toBe(defaultTransform.anchorY)
  })

  it('fits costume width and height to visible shoulders and hips', () => {
    const fitted = fitCostumeTransformToBody(
      { anchorX: 160, anchorY: 130, width: 400, height: 600, rotation: 0 },
      [
        { name: 'left_shoulder', x: 260, y: 250, score: 0.9 },
        { name: 'right_shoulder', x: 60, y: 250, score: 0.9 },
        { name: 'left_hip', x: 230, y: 430, score: 0.9 },
        { name: 'right_hip', x: 90, y: 430, score: 0.9 },
      ],
      2 / 3,
      { shoulderWidthRatio: 0.46, torsoHeightRatio: 0.18, blend: 0.7 },
    )

    expect(fitted.width).toBeGreaterThan(400)
    expect(fitted.height).toBeGreaterThan(600)
    expect(fitted.anchorX).toBe(160)
  })

  it('keeps face-only sizing when shoulders are not visible', () => {
    const faceTransform = {
      anchorX: 160,
      anchorY: 130,
      width: 400,
      height: 600,
      rotation: 0,
    }
    expect(
      fitCostumeTransformToBody(faceTransform, [], 2 / 3, {
        shoulderWidthRatio: 0.46,
        torsoHeightRatio: 0.18,
        blend: 0.7,
      }),
    ).toBe(faceTransform)
  })

  it('uses a location-specific face opening when sizing headwear', () => {
    const face = { xMin: 100, yMin: 60, width: 120, height: 140 }
    const defaultTransform = getSnowCostumeTransform(face, [], [], 1)
    const fuguTransform = getSnowCostumeTransform(face, [], [], 1, 0.52, 1.3)

    expect(fuguTransform.width).toBeLessThan(defaultTransform.width)
    expect(fuguTransform.anchorX).toBe(defaultTransform.anchorX)
    expect(fuguTransform.anchorY).toBe(defaultTransform.anchorY)
  })

  it('smoothes translation, scale, and rotation together', () => {
    const previous = { anchorX: 0, anchorY: 0, width: 100, height: 200, rotation: 0 }
    const current = { anchorX: 20, anchorY: 40, width: 140, height: 240, rotation: 0.2 }
    expect(smoothCostumeTransform(previous, current, 0.5)).toEqual({
      anchorX: 10,
      anchorY: 20,
      width: 120,
      height: 220,
      rotation: 0.1,
    })
  })

  it('creates a person obstacle from visible pose landmarks', () => {
    const prediction = poseToPersonPrediction([
      { x: 100, y: 50, score: 0.9 },
      { x: 200, y: 50, score: 0.9 },
      { x: 100, y: 300, score: 0.9 },
      { x: 200, y: 300, score: 0.9 },
    ])
    expect(prediction?.class).toBe('person')
    expect(prediction?.bbox[2]).toBeGreaterThan(100)
  })

  it('reconstructs a face from MoveNet eyes and nose when FaceMesh misses', () => {
    const face = poseToTrackedFace([
      { name: 'nose', x: 160, y: 125, score: 0.95 },
      { name: 'left_eye', x: 180, y: 100, score: 0.9 },
      { name: 'right_eye', x: 140, y: 102, score: 0.9 },
      { name: 'left_ear', x: 205, y: 115, score: 0.8 },
      { name: 'right_ear', x: 115, y: 116, score: 0.8 },
    ])
    expect(face).toBeDefined()
    expect(face?.box.width).toBeGreaterThan(90)
    expect(face?.keypoints.map((point) => point.name)).toContain('rightEye')
  })

  it('does not invent a face without both eyes and the nose', () => {
    expect(
      poseToTrackedFace([
        { name: 'nose', x: 160, y: 125, score: 0.95 },
        { name: 'left_eye', x: 180, y: 100, score: 0.9 },
      ]),
    ).toBeUndefined()
  })
})

describe('getFixedBrandLayout', () => {
  it('keeps the character and label inside the visible bottom-left cover crop', () => {
    const layout = getFixedBrandLayout(1280, 720, 1280, 608, 0.75)
    const visibleBottom = 664

    expect(layout.image.x).toBeGreaterThanOrEqual(0)
    expect(layout.image.y).toBeGreaterThan(56)
    expect(layout.textBaselineY).toBeLessThan(visibleBottom)
    expect(layout.image.y + layout.image.height).toBeLessThan(layout.textBaselineY)
  })
})
