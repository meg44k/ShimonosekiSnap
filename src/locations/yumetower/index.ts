import type { LocationConfig } from '../types'
import overlaySrc from './yumetower-character.png?url'
import costumeSrc from './yumetower-costume.png?url'

export const yumetowerLocation: LocationConfig = {
  id: 'yumetower',
  name: '海峡ゆめタワー',
  guidanceText: '顔と上半身が映るようにカメラを向けてください',
  cameraMode: 'person-detection',
  overlaySrc,
  costumeSrc,
  brandLabel: '海峡ゆめタワー',
  costumeLayout: {
    faceHoleCenterXRatio: 0.5,
    faceHoleCenterYRatio: 0.315,
    faceHoleWidthRatio: 0.36,
    faceScale: 1.02,
  },
  costumeTransparentSeeds: [
    { xRatio: 0.5, yRatio: 0.32 },
    { xRatio: 0.2, yRatio: 0.57 },
    { xRatio: 0.8, yRatio: 0.57 },
    { xRatio: 0.5, yRatio: 0.85 },
  ],
  detectionThreshold: 0.5,
  maxSubjects: 3,
}
