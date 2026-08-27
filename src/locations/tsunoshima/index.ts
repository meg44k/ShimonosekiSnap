import type { LocationConfig } from '../types'
import { loadWhaleModel } from './loadWhaleModel'
import { getWhaleTransform } from './whaleAnimation'

export const tsunoshimaLocation: LocationConfig = {
  id: 'tsunoshima',
  name: '角島大橋',
  guidanceText: '角島大橋を映してください',
  targetSrc: 'targets/tunoshima.mind',
  effect: {
    loadModel: loadWhaleModel,
    getTransform: getWhaleTransform,
  },
}
