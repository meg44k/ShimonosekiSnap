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
  detectionThreshold: 0.5,
}
