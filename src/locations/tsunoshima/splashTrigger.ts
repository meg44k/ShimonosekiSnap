import { getWhaleTransform } from './whaleAnimation'
import { SEA_LEVEL_Y } from './seaLevel'

export type SplashKind = 'exit' | 'entry'

export interface SplashEvent {
  kind: SplashKind
  position: [number, number, number]
}

// ArCameraViewは毎フレームelapsedMsを渡してくるので、prev/currは通常
// 1フレーム分(数十ms)しか離れていない。その短い区間でクジラのY座標が
// SEA_LEVEL_Yをまたいだ場合だけ、水しぶきイベントを1回発生させる。
// 軌道はベジェ曲線で滑らかなため、frame間隔が短ければ直線近似で
// またいだかどうかを判定しても実用上問題ない。
export function detectSplashCrossing(prevElapsedMs: number, elapsedMs: number): SplashEvent | null {
  if (elapsedMs <= prevElapsedMs) return null

  const prev = getWhaleTransform(prevElapsedMs)
  const curr = getWhaleTransform(elapsedMs)
  if (!prev.visible || !curr.visible) return null

  const prevBelow = prev.position[1] < SEA_LEVEL_Y
  const currBelow = curr.position[1] < SEA_LEVEL_Y
  if (prevBelow === currBelow) return null

  return {
    kind: prevBelow ? 'exit' : 'entry',
    position: curr.position,
  }
}
