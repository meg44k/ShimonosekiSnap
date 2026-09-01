import type { LocationConfig } from '../types'
import fuguHatSrc from './fugu-hat.png?url'
import karatoCharacterSrc from './karato-character.png?url'

export const karatoLocation: LocationConfig = {
  id: 'karato',
  name: '唐戸市場',
  guidanceText: '顔が映るようにカメラを向けてください',
  cameraMode: 'person-detection',
  overlaySrc: karatoCharacterSrc,
  costumeSrc: fuguHatSrc,
  brandLabel: '唐戸市場',
  showBrandImage: true,
  costumeLayout: {
    faceHoleCenterXRatio: 0.5,
    faceHoleCenterYRatio: 0.58,
    faceHoleWidthRatio: 0.52,
    faceScale: 1.3,
  },
  detectionThreshold: 0.5,
  maxSubjects: 3,
}
