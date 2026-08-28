import { useEffect, useRef, useState } from 'react'
// @ts-expect-error mind-ar has no bundled TypeScript types
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js'
import * as THREE from 'three'
import type { ArTransform, ImageTargetLocationConfig } from '../../locations/types'
import { captureComposite } from './captureComposite'

interface ArCameraViewProps {
  location: ImageTargetLocationConfig
  onCapture: (photoDataUrl: string) => void
  onClose: () => void
  onError: (message: string) => void
}

const HIDDEN_TRANSFORM: ArTransform = { position: [0, 0, 0], rotationY: 0, visible: false }

export function ArCameraView({ location, onCapture, onClose, onError }: ArCameraViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // mind-arにTypeScript型定義がないため、インスタンスの型はanyになる(意図的)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mindarRef = useRef<any>(null)
  const captureRequestedRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [targetFound, setTargetFound] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    let started = false

    const mindarThree = new MindARThree({
      container: containerRef.current,
      imageTargetSrc: `${import.meta.env.BASE_URL}${location.targetSrc}`,
      uiLoading: 'no',
      uiScanning: 'no',
      uiError: 'no',
    })
    mindarRef.current = mindarThree
    const { renderer, scene, camera } = mindarThree

    const anchor = mindarThree.addAnchor(0)
    const effectGroup = new THREE.Group()
    effectGroup.visible = false
    anchor.group.add(effectGroup)

    let targetVisible = false
    let startedAt = performance.now()
    anchor.onTargetFound = () => {
      targetVisible = true
      startedAt = performance.now()
      setTargetFound(true)
    }
    anchor.onTargetLost = () => {
      targetVisible = false
      effectGroup.visible = false
      setTargetFound(false)
    }

    location.effect
      .loadModel()
      .then((model) => {
        if (cancelled) return
        effectGroup.add(model)
      })
      .catch((error) => {
        console.error('[ar] failed to load effect model', error)
        if (!cancelled) onError('エフェクトの読み込みに失敗しました')
      })

    mindarThree
      .start()
      .then(() => {
        started = true
        if (cancelled) {
          mindarThree.stop()
          return
        }
        setReady(true)
        renderer.setAnimationLoop(() => {
          const transform = targetVisible
            ? location.effect.getTransform(performance.now() - startedAt)
            : HIDDEN_TRANSFORM
          effectGroup.visible = transform.visible
          if (transform.visible) {
            effectGroup.position.set(...transform.position)
            effectGroup.rotation.y = transform.rotationY
          }
          renderer.render(scene, camera)

          if (captureRequestedRef.current) {
            captureRequestedRef.current = false
            try {
              const videoEl: HTMLVideoElement | null =
                mindarThree.video ?? containerRef.current?.querySelector('video') ?? null
              if (!videoEl) {
                onError('カメラ映像を取得できませんでした')
              } else {
                onCapture(captureComposite(videoEl, renderer.domElement))
              }
            } catch (error) {
              console.error('[ar] failed to capture photo', error)
              onError('撮影に失敗しました')
            }
          }
        })
      })
      // mindarThree.start()の戻り値は型定義がないためanyになり、
      // catchの引数も暗黙のanyになるので明示的にunknownを指定する
      .catch((error: unknown) => {
        console.error('[ar] failed to start camera/tracking', error)
        if (!cancelled) {
          onError('カメラを起動できませんでした。ブラウザの設定からカメラの使用を許可してください。')
        }
      })

    return () => {
      cancelled = true
      renderer.setAnimationLoop(null)
      if (started) {
        mindarThree.stop()
      }
      renderer.dispose()
      effectGroup.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          for (const material of materials) {
            material.dispose()
          }
        }
      })
      mindarRef.current = null
    }
  }, [location, onError])

  const handleShutter = () => {
    captureRequestedRef.current = true
  }

  return (
    <div className="camera-screen">
      <div className="video-container">
        <div className="ar-container" ref={containerRef} />
        {(!ready || !targetFound) && (
          <div className="ar-status-overlay">{!ready ? 'カメラを起動中...' : location.guidanceText}</div>
        )}
      </div>
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
