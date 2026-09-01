import { useCallback, useEffect, useRef, useState } from 'react'
import { drawComposite } from './captureComposite'
import { createCompositeRecorder, isVideoRecordingSupported } from './recordComposite'

/** この端末で動画録画が使えるか(モジュール読み込み時に一度だけ判定) */
export const VIDEO_RECORDING_SUPPORTED = isVideoRecordingSupported()

/** 録画キャンバスの最大辺(px)。スマホでの負荷・メモリを抑える */
const RECORD_MAX_SIDE = 1280

export type CaptureMode = 'photo' | 'video'

export interface CompositeSources {
  video: HTMLVideoElement
  /** エフェクト描画済みのキャンバス(MindAR の renderer.domElement / 顔フィルタの overlay) */
  overlay: HTMLCanvasElement
  isMirror: boolean
}

interface UseVideoCaptureArgs {
  /** 合成ソースを返す。準備できていなければ null */
  getSources: () => CompositeSources | null
  /** 録画完了時。url は再生用 blob URL(App 側で revoke) */
  onVideo: (url: string, blob: Blob) => void
  onError: (message: string) => void
}

export function useVideoCapture({ getSources, onVideo, onError }: UseVideoCaptureArgs) {
  const [mode, setMode] = useState<CaptureMode>('photo')
  const [recording, setRecording] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)
  const recorderRef = useRef<ReturnType<typeof createCompositeRecorder> | null>(null)
  const tickRef = useRef(0)

  const clearTick = () => {
    window.clearInterval(tickRef.current)
    tickRef.current = 0
  }

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop()
  }, [])

  const startRecording = useCallback(() => {
    const src = getSources()
    if (!src || !src.video.videoWidth) {
      onError('カメラの準備ができていません')
      return
    }
    const rawW = src.overlay.width || src.video.videoWidth
    const rawH = src.overlay.height || src.video.videoHeight
    const scale = Math.min(1, RECORD_MAX_SIDE / Math.max(rawW, rawH))

    try {
      const recorder = createCompositeRecorder({
        width: Math.max(2, Math.round(rawW * scale)),
        height: Math.max(2, Math.round(rawH * scale)),
        drawFrame: (ctx) => {
          const now = getSources()
          if (now) {
            drawComposite(ctx, now.video, now.overlay, ctx.canvas.width, ctx.canvas.height, now.isMirror)
          }
        },
        onStopped: ({ blob, url }) => {
          setRecording(false)
          clearTick()
          setElapsedSec(0)
          recorderRef.current = null
          onVideo(url, blob)
        },
        onError: (message) => {
          setRecording(false)
          clearTick()
          recorderRef.current = null
          onError(message)
        },
      })
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
      setElapsedSec(0)
      const startedAt = Date.now()
      tickRef.current = window.setInterval(
        () => setElapsedSec(Math.floor((Date.now() - startedAt) / 1000)),
        250,
      )
    } catch {
      onError('この端末は動画撮影に対応していません')
    }
  }, [getSources, onVideo, onError])

  // アンマウント時に録画中なら止める
  useEffect(
    () => () => {
      clearTick()
      recorderRef.current?.stop()
    },
    [],
  )

  return {
    videoSupported: VIDEO_RECORDING_SUPPORTED,
    mode,
    setMode,
    recording,
    elapsedSec,
    startRecording,
    stopRecording,
  }
}
