import type { CaptureMode } from './useVideoCapture'

/** 写真 / 動画 のモード切替(セグメント)。動画非対応端末では呼び出し側で出さない */
export function CameraModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: CaptureMode
  onChange: (mode: CaptureMode) => void
  disabled?: boolean
}) {
  return (
    <div className="camera-mode-toggle" role="tablist" aria-label="撮影モード">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'photo'}
        className={mode === 'photo' ? 'is-active' : ''}
        onClick={() => onChange('photo')}
        disabled={disabled}
      >
        写真
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'video'}
        className={mode === 'video' ? 'is-active' : ''}
        onClick={() => onChange('video')}
        disabled={disabled}
      >
        動画
      </button>
    </div>
  )
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** 録画中インジケータ(赤丸＋経過時間) */
export function RecordingIndicator({ elapsedSec }: { elapsedSec: number }) {
  return (
    <div className="recording-indicator" aria-live="polite">
      <span className="recording-dot" />
      REC {formatElapsed(elapsedSec)}
    </div>
  )
}
