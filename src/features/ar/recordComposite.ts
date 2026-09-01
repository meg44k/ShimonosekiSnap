// カメラ映像＋エフェクトを合成した動画を録画する。オフスクリーン canvas に
// 毎フレーム 1 コマを描き、canvas.captureStream() を MediaRecorder で録る。
// 停止(手動 or 上限到達)で Blob と再生用の blob URL を onStopped で返す。

const VIDEO_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const

/** この端末で使える動画 MIME タイプ。無ければ null */
export function pickVideoMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return null
  }
  for (const type of VIDEO_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return null
}

/** 動画録画が使えるか(MediaRecorder / captureStream / 対応 MIME) */
export function isVideoRecordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    pickVideoMimeType() !== null
  )
}

export interface RecordResult {
  blob: Blob
  /** URL.createObjectURL(blob)。プレビュー用。呼び出し側が revoke する */
  url: string
  mimeType: string
  /** 実際の録画秒数(概算) */
  durationSec: number
}

export interface RecordOptions {
  width: number
  height: number
  /** captureStream / 描画ループの目標 fps。既定 30 */
  fps?: number
  /** 暴走防止の自動停止(ms)。既定 60000。手動停止が基本 */
  maxDurationMs?: number
  /** 毎フレーム、与えられた 2D ctx に 1 コマを描くコールバック */
  drawFrame: (ctx: CanvasRenderingContext2D) => void
  /** 停止時(手動・自動どちらも)に一度だけ呼ばれる */
  onStopped: (result: RecordResult) => void
  /** 録画開始/停止に失敗したとき */
  onError?: (message: string) => void
}

export interface CompositeRecorder {
  start(): void
  stop(): void
  readonly recording: boolean
}

export function createCompositeRecorder(options: RecordOptions): CompositeRecorder {
  const mimeType = pickVideoMimeType()
  if (!mimeType) throw new Error('video recording is not supported on this device')

  const fps = options.fps ?? 30
  const maxDurationMs = options.maxDurationMs ?? 60_000

  const canvas = document.createElement('canvas')
  canvas.width = options.width
  canvas.height = options.height
  const maybeCtx = canvas.getContext('2d')
  if (!maybeCtx) throw new Error('2D context is not available')
  const ctx: CanvasRenderingContext2D = maybeCtx

  const stream = canvas.captureStream(fps)
  let recorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let rafId = 0
  let autoStopTimer = 0
  let startedAt = 0
  let running = false
  let stopping = false

  function tick(): void {
    if (!running) return
    try {
      options.drawFrame(ctx)
    } catch {
      // 1 フレームの描画失敗で録画全体を止めない
    }
    rafId = requestAnimationFrame(tick)
  }

  function teardown(): void {
    cancelAnimationFrame(rafId)
    window.clearTimeout(autoStopTimer)
    stream.getTracks().forEach((track) => track.stop())
  }

  return {
    get recording() {
      return running
    },

    start() {
      if (running) return
      try {
        chunks = []
        recorder = new MediaRecorder(stream, { mimeType })
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) chunks.push(event.data)
        }
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType })
          const url = URL.createObjectURL(blob)
          const durationSec = (performance.now() - startedAt) / 1000
          teardown()
          running = false
          stopping = false
          options.onStopped({ blob, url, mimeType, durationSec })
        }
        running = true
        startedAt = performance.now()
        recorder.start()
        rafId = requestAnimationFrame(tick)
        autoStopTimer = window.setTimeout(() => this.stop(), maxDurationMs)
      } catch (error) {
        running = false
        teardown()
        options.onError?.(error instanceof Error ? error.message : '録画を開始できませんでした')
      }
    },

    stop() {
      if (!running || stopping || !recorder) return
      stopping = true
      running = false
      cancelAnimationFrame(rafId)
      window.clearTimeout(autoStopTimer)
      try {
        recorder.stop() // → onstop で Blob 化して onStopped
      } catch (error) {
        stopping = false
        teardown()
        options.onError?.(error instanceof Error ? error.message : '録画の停止に失敗しました')
      }
    },
  }
}
