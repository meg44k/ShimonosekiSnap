import type { LocationConfig } from '../types'
import { getAkamaTransform } from './akamaAnimation'

export const akamaLocation: LocationConfig = {
  id: 'akama',
  name: '赤間神宮',
  guidanceText: '赤間神宮（水天門）を映してください',
  cameraMode: 'image-target',
  targetSrc: 'targets/akama.mind',
  effect: {
    loadModel: () => import('./loadAkamaModel').then((m) => m.loadAkamaModel()),
    getTransform: getAkamaTransform,
  },
}
