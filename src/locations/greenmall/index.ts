import type { LocationConfig } from '../types'
import chimaJeogoriSrc from './greenmall-chima-jeogori.png?url'
import greenmallGateSrc from './greenmall-gate.png?url'

export const greenmallLocation: LocationConfig = {
  id: 'greenmall',
  name: 'グリーンモール',
  guidanceText: '顔と上半身が映るようにカメラを向けてください',
  cameraMode: 'person-detection',
  overlaySrc: greenmallGateSrc,
  costumeSrc: chimaJeogoriSrc,
  detectionThreshold: 0.5,
  brandLabel: 'グリーンモール',
  costumeLayout: {
    faceHoleCenterXRatio: 0.5,
    faceHoleCenterYRatio: 0.055,
    faceHoleWidthRatio: 0.22,
    faceScale: 1.08,
    renderer: 'textured-hanbok',
    bodyFit: {
      shoulderWidthRatio: 0.46,
      torsoHeightRatio: 0.18,
      blend: 0.7,
    },
  },
  costumeTransparentSeeds: [],
}
