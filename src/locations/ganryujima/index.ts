import type { LocationConfig } from '../types'
import { loadKatanaModel } from './loadKatanaModel'

export const ganryujimaLocation: LocationConfig = {
  id: 'ganryujima',
  name: '巌流島',
  guidanceText: 'カメラに上半身を映してください（構えると手に刀が現れます）',
  targetSrc: '', // 人物ポーズトラッキングのためマーカー不要
  effect: {
    loadModel: loadKatanaModel,
    getTransform: () => ({ position: [0, 0, 0], rotationY: 0, visible: true }),
  },
}
