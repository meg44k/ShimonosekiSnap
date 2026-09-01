// 撮影した写真(PNG の data URL)をユーザーの端末に保存する。
//
// スマートフォン、とくに iOS Safari は `<a download>` を無視する(属性が
// 未サポート)ため、従来のリンククリック方式では「保存」ボタンを押しても
// 何も起きなかった。モバイルでは Web Share API(ファイル共有)を使い、
// OS ネイティブの「写真に保存 / 共有」シートを開く。共有が使えない環境
// (デスクトップ等)は従来どおり `<a download>` にフォールバックする。

export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled'

interface ShareCapableNavigator {
  share?: (data: ShareData) => Promise<void>
  canShare?: (data?: ShareData) => boolean
}

export interface SavePhotoDeps {
  /** テスト用に navigator を差し替える。null を渡すと共有を試みない */
  navigator?: ShareCapableNavigator | null
  /** テスト用に <a> 生成を差し替える */
  createAnchor?: () => HTMLAnchorElement
}

/** `data:[<mime>][;base64],<data>` を Blob に変換する(同期。ジェスチャ内で呼べる) */
export function dataUrlToBlob(dataUrl: string): Blob {
  const commaIndex = dataUrl.indexOf(',')
  if (!dataUrl.startsWith('data:') || commaIndex === -1) {
    throw new Error('invalid data URL')
  }
  const header = dataUrl.slice(5, commaIndex)
  const body = dataUrl.slice(commaIndex + 1)
  const mime = header.split(';')[0] || 'application/octet-stream'

  if (/;base64/i.test(header)) {
    const binary = atob(body)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  }
  return new Blob([decodeURIComponent(body)], { type: mime })
}

/**
 * 写真を保存する。戻り値は実際に取られた経路:
 * - `shared`     … OS の共有/保存シートを開いた(モバイル)
 * - `downloaded` … <a download> でダウンロードした(デスクトップ等)
 * - `cancelled`  … 共有シートをユーザーが閉じた
 */
export async function savePhoto(
  dataUrl: string,
  filename: string,
  deps: SavePhotoDeps = {},
): Promise<SaveOutcome> {
  const nav =
    deps.navigator === undefined
      ? typeof navigator !== 'undefined'
        ? (navigator as ShareCapableNavigator)
        : null
      : deps.navigator

  if (nav?.share && nav.canShare) {
    const file = new File([dataUrlToBlob(dataUrl)], filename, { type: 'image/png' })
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: filename })
        return 'shared'
      } catch (error) {
        // シートを閉じただけなら失敗ではない
        if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
        // それ以外(NotAllowedError 等)は下のダウンロードへフォールバック
      }
    }
  }

  const anchor = deps.createAnchor?.() ?? document.createElement('a')
  anchor.href = dataUrl
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.click()
  return 'downloaded'
}
