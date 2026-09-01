import type { ArTransform } from '../types'

export function getAkamaTransform(elapsedMs: number): ArTransform {
  // わずかな浮遊アニメーション（周期約3秒）
  const floatOffset = Math.sin((elapsedMs / 3000) * Math.PI * 2) * 0.008

  return {
    position: [0, floatOffset, 0],
    rotationX: 0,
    rotationY: 0,
    visible: true,
  }
}
