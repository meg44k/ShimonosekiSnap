import type { LocationConfig } from '../types'
import { getWhaleTransform } from './whaleAnimation'

export const tsunoshimaLocation: LocationConfig = {
  id: 'tsunoshima',
  name: '角島大橋',
  guidanceText: '角島大橋を映してください',
  cameraMode: 'image-target',
  targetSrc: 'targets/tunoshima.mind',
  effect: {
    loadModel: () => import('./loadWhaleModel').then((m) => m.loadWhaleModel()),
    getTransform: getWhaleTransform,
  },
}
