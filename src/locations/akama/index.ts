import type { LocationConfig } from '../types'
import { getAkamaTransform } from './akamaAnimation'

export const akamaLocation: LocationConfig = {
  id: 'akama',
  name: '赤間神宮',
  guidanceText: '赤間神宮を映してください',
  targetSrc: 'targets/tunoshima.mind',
  effect: {
    loadModel: () => import('./loadAkamaModel').then((m) => m.loadAkamaModel()),
    getTransform: getAkamaTransform,
  },
}
