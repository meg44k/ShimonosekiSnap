import { useEffect, useRef, useState } from 'react'
// mind-arにTypeScript型定義がないため、次の行の暗黙のany型エラーを抑制する(意図的)
// @ts-expect-error -- mind-ar has no bundled type declarations
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js'
import * as THREE from 'three'
import { captureComposite } from './captureComposite'
import { loadWhaleModel } from './loadWhaleModel'
import { getWhaleTransform, type WhaleTransform } from './whaleAnimation'

interface ArCameraViewProps {
  onCapture: (photoDataUrl: string) => void
  onClose: () => void
  onError: (message: string) => void
}

const HIDDEN_TRANSFORM: WhaleTransform = { position: [0, 0, 0], rotationY: 0, visible: false }

export function ArCameraView({ onCapture, onClose, onError }: ArCameraViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // mind-arにTypeScript型定義がないため、インスタンスの型はanyになる(意図的)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mindarRef = useRef<any>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    let started = false

    const mindarThree = new MindARThree({
      container: containerRef.current,
      imageTargetSrc: '/targets/tunoshima.mind',
    })
    mindarRef.current = mindarThree
    const { renderer, scene, camera } = mindarThree

    const anchor = mindarThree.addAnchor(0)
    const whaleGroup = new THREE.Group()
    whaleGroup.visible = false
    anchor.group.add(whaleGroup)

    let targetVisible = false
    anchor.onTargetFound = () => {
      targetVisible = true
    }
    anchor.onTargetLost = () => {
      targetVisible = false
      whaleGroup.visible = false
    }

    const startedAt = performance.now()

    loadWhaleModel()
      .then((whale) => {
        if (cancelled) return
        whaleGroup.add(whale)
      })
      .catch(() => {
        if (!cancelled) onError('クジラモデルの読み込みに失敗しました')
      })

    mindarThree
      .start()
      .then(() => {
        if (cancelled) return
        started = true
        setReady(true)
        renderer.setAnimationLoop(() => {
          const transform = targetVisible
            ? getWhaleTransform(performance.now() - startedAt)
            : HIDDEN_TRANSFORM
          whaleGroup.visible = transform.visible
          if (transform.visible) {
            whaleGroup.position.set(...transform.position)
            whaleGroup.rotation.y = transform.rotationY
          }
          renderer.render(scene, camera)
        })
      })
      .catch(() => {
        if (!cancelled) {
          onError('カメラを起動できませんでした。ブラウザの設定からカメラの使用を許可してください。')
        }
      })

    return () => {
      cancelled = true
      renderer.setAnimationLoop(null)
      // start()が解決する前にクリーンアップが走ると(StrictModeの二重実行や、
      // 起動直後に閉じるケースで発生しうる)、mind-ar内部が未初期化のまま
      // stop()を呼び出しエラーになるため、start()解決後のみ呼び出す
      if (started) {
        mindarThree.stop()
      }
      mindarRef.current = null
    }
  }, [onError])

  const handleShutter = () => {
    const mindarThree = mindarRef.current
    if (!mindarThree) return
    const videoEl: HTMLVideoElement | null =
      mindarThree.video ?? containerRef.current?.querySelector('video') ?? null
    if (!videoEl) {
      onError('カメラ映像を取得できませんでした')
      return
    }
    const photoDataUrl = captureComposite(videoEl, mindarThree.renderer.domElement)
    onCapture(photoDataUrl)
  }

  return (
    <div className="camera-screen">
      <div className="video-container ar-container" ref={containerRef} />
      <div className="camera-controls">
        <button
          type="button"
          className="btn btn-shutter"
          onClick={handleShutter}
          disabled={!ready}
          title="撮影"
        >
          <span className="shutter-inner" />
        </button>
        <button type="button" className="btn btn-icon" onClick={onClose} title="閉じる">
          ✕
        </button>
      </div>
    </div>
  )
}
