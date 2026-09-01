import { useEffect, useState } from 'react'
// @ts-expect-error mind-ar has no bundled TypeScript types
import { Compiler } from 'mind-ar/dist/mindar-image.prod.js'
import akamaJpgUrl from '../../public/targets/akama.jpg?url'

export function CompilePage() {
  const [status, setStatus] = useState<'idle' | 'compiling' | 'success' | 'error'>('idle')
  const [progress, setProgress] = useState<number>(0)
  const [message, setMessage] = useState<string>('')

  const handleCompile = async () => {
    setStatus('compiling')
    setProgress(0)
    setMessage('画像「akama.jpg」を読み込み中...')

    try {
      const img = new Image()
      img.src = akamaJpgUrl
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = (e) => reject(new Error(`画像の読み込みに失敗しました: ${String(e)}`))
      })

      setMessage('MindAR Compiler で画像特徴量を抽出中（数秒〜十数秒かかります）...')
      const compiler = new Compiler()
      await compiler.compileImageTargets([img], (p: number) => {
        setProgress(Math.round(p))
      })

      setMessage('コンパイル完了！ .mind データを保存中...')
      const buffer = await compiler.exportData()

      // 開発サーバーの /api/save-target に POST して public/targets/akama.mind に保存
      const response = await fetch('/api/save-target?name=akama.mind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buffer,
      })

      if (!response.ok) {
        throw new Error(`保存APIがエラーを返しました: ${response.statusText}`)
      }

      setStatus('success')
      setMessage('✅ akama.mind の生成と保存が完了しました！')
    } catch (err) {
      console.error('[compiler]', err)
      setStatus('error')
      setMessage(`❌ エラー: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ページ表示時に自動でコンパイル開始
  useEffect(() => {
    handleCompile()
  }, [])

  return (
    <div className="start-screen" style={{ padding: '24px', maxWidth: '480px', margin: '0 auto' }}>
      <h2>⛩️ 赤間神宮 ARターゲット生成</h2>
      <p style={{ fontSize: '14px', color: 'var(--text)' }}>
        赤間神宮（水天門）の画像からAR認識用データ（<code>akama.mind</code>）をブラウザ上で高速コンパイルします。
      </p>

      <div style={{ margin: '16px 0', width: '100%' }}>
        <img
          src={akamaJpgUrl}
          alt="赤間神宮 水天門"
          style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '12px' }}
        />
      </div>

      <div style={{ margin: '16px 0', width: '100%', textAlign: 'center' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-h)' }}>{message}</div>
        {status === 'compiling' && (
          <div style={{ width: '100%', background: 'var(--social-bg)', borderRadius: '8px', overflow: 'hidden', height: '16px' }}>
            <div
              style={{
                width: `${progress}%`,
                background: 'var(--accent)',
                height: '100%',
                transition: 'width 0.2s',
              }}
            />
          </div>
        )}
      </div>

      {status === 'success' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
          <a
            href="/spot/akama"
            className="btn btn-primary"
            style={{ textDecoration: 'none', textAlign: 'center' }}
          >
            📸 赤間神宮のカメラを試す
          </a>
        </div>
      )}

      {status === 'error' && (
        <button type="button" className="btn btn-secondary" onClick={handleCompile}>
          再試行
        </button>
      )}
    </div>
  )
}
