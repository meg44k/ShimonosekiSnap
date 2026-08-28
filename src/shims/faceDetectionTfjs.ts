import { load } from '@tensorflow-models/face-detection/dist/tfjs/detector'
import type { MediaPipeFaceDetectorTfjsModelConfig } from '@tensorflow-models/face-detection/dist/tfjs/types'

export const SupportedModels = {
  MediaPipeFaceDetector: 'MediaPipeFaceDetector',
} as const

export function createDetector(
  _model: (typeof SupportedModels)[keyof typeof SupportedModels],
  config: MediaPipeFaceDetectorTfjsModelConfig,
) {
  return load(config)
}
