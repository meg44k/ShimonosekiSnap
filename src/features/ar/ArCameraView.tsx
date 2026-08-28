import { useEffect, useRef, useState } from 'react'
// @ts-expect-error mind-ar has no bundled TypeScript types
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js'
import * as THREE from 'three'
import type { ArTransform, LocationConfig } from '../../locations/types'
import { captureComposite } from './captureComposite'
import { createLineArtRenderer, WHALE_LINEART_LAYER, type LineArtRenderer } from './lineArtRenderer'

interface ArCameraViewProps {
  location: LocationConfig
  onCapture: (photoDataUrl: string) => void
  onClose: () => void
  onError: (message: string) => void
}

const HIDDEN_TRANSFORM: ArTransform = { position: [0, 0, 0], rotationX: 0, rotationY: 0, visible: false }

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
    let lineArt: LineArtRenderer | null = null
    let resizeCleanup: (() => void) | null = null
    const { renderer, scene, camera } = mindarThree
    renderer.localClippingEnabled = true
    renderer.autoClear = false

    if (!renderer.capabilities.isWebGL2) {
      onError('お使いのブラウザはこのエフェクトに対応していません(WebGL2が必要です)')
      return () => {
        mindarRef.current = null
      }
    }

    const anchor = mindarThree.addAnchor(0)
    const effectGroup = new THREE.Group()
    // ヨーが大きい(76〜106°)状態で pitch(rotationX)を効かせるので、
    // デフォルトの XYZ 合成順序だと pitch がほぼロールに化ける。YXZ に
    // することで whaleAnimation.ts のコメントどおり頭のワールドY成分が
    // ちょうど -sin(rotationX) になる。
    effectGroup.rotation.order = 'YXZ'
    effectGroup.visible = false
    anchor.group.add(effectGroup)
    let modelUpdate: ((deltaSeconds: number) => void) | null = null
    // markerObjectはeffectGroup(毎フレーム位置/回転が上書きされる)の外、
    // アンカー直下に追加する。モデル本体とは独立してマーカー座標系に
    // 固定された要素(例: 水しぶき)を描画するための仕組み。
    let markerObject: THREE.Object3D | null = null
    let modelMarkerUpdate: ((deltaSeconds: number, elapsedMs: number) => void) | null = null
    // clippingPlanesはアンカー(マーカー)のローカル座標系で定義されるため、
    // 毎フレームアンカーのワールド行列を掛けてワールド座標系に変換したものを
    // マテリアルに割り当てる(worldClippingPlanesは参照を維持したまま
    // 中身だけ更新する。マテリアル側にはこの配列の参照を渡す)。
    let localClippingPlanes: THREE.Plane[] = []
    let worldClippingPlanes: THREE.Plane[] = []

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
        effectGroup.add(model.object)
        if (model.lineArt) {
          model.object.traverse((child) => {
            // Sprite(スパークル)は線画化しない。Mesh/SkinnedMesh だけ隔離する。
            if (child instanceof THREE.Mesh) {
              child.layers.set(WHALE_LINEART_LAYER)
            }
          })
          lineArt = createLineArtRenderer()
          const container = containerRef.current
          if (container) {
            lineArt.setSize(container.clientWidth, container.clientHeight, window.devicePixelRatio)
          }
        }
        modelUpdate = model.update ?? null
        if (model.markerObject) {
          markerObject = model.markerObject
          anchor.group.add(markerObject)
        }
        modelMarkerUpdate = model.markerUpdate ?? null
        if (model.clippingPlanes && model.clippingPlanes.length > 0) {
          localClippingPlanes = model.clippingPlanes
          worldClippingPlanes = localClippingPlanes.map(() => new THREE.Plane())
          model.object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              const materials = Array.isArray(child.material) ? child.material : [child.material]
              for (const material of materials) {
                material.clippingPlanes = worldClippingPlanes
              }
            }
          })
        }
        lineArt?.setClippingPlanes(worldClippingPlanes.length > 0 ? worldClippingPlanes : null)
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
        const handleResize = () => {
          const container = containerRef.current
          if (container && lineArt) {
            lineArt.setSize(container.clientWidth, container.clientHeight, window.devicePixelRatio)
          }
        }
        window.addEventListener('resize', handleResize)
        resizeCleanup = () => window.removeEventListener('resize', handleResize)
        let lastFrameAt = performance.now()
        renderer.setAnimationLoop(() => {
          const now = performance.now()
          const deltaSeconds = (now - lastFrameAt) / 1000
          lastFrameAt = now

          const transform = targetVisible ? location.effect.getTransform(now - startedAt) : HIDDEN_TRANSFORM
          effectGroup.visible = transform.visible
          if (transform.visible) {
            effectGroup.position.set(...transform.position)
            effectGroup.rotation.x = transform.rotationX
            effectGroup.rotation.y = transform.rotationY
            modelUpdate?.(deltaSeconds * (transform.animationSpeed ?? 1))
            if (localClippingPlanes.length > 0) {
              anchor.group.updateMatrixWorld(true)
              for (let i = 0; i < localClippingPlanes.length; i++) {
                worldClippingPlanes[i].copy(localClippingPlanes[i]).applyMatrix4(anchor.group.matrixWorld)
              }
            }
          }
          if (targetVisible) {
            modelMarkerUpdate?.(deltaSeconds, now - startedAt)
          }

          // 画面を1回だけクリア(autoClear=false のため手動)
          renderer.setRenderTarget(null)
          renderer.setClearColor(0x000000, 0)
          renderer.clear(true, true, true)

          if (lineArt) {
            // 法線プリパス → エッジ検出パス(線画のクジラを画面へ)。
            // クジラが非表示のコマ(サイクル毎の1.5秒ポーズ、ターゲット
            // ロスト中)はプリパスもエッジパスも無駄なのでスキップする。
            if (transform.visible) {
              lineArt.renderLineArt(renderer, scene, camera, now - startedAt)
            }
            // オーバーレイ: レイヤー0(スパークル・水しぶき)を上に重ねる。
            // ポーズ中もスプラッシュ粒子は animate させ続けたいので常に実行。
            renderer.clearDepth()
            camera.layers.set(0)
            renderer.render(scene, camera)
            camera.layers.set(0)
          } else {
            renderer.render(scene, camera)
          }

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
      // Sprite(スパークル/水しぶき)と Mesh の両方を破棄する共通処理。
      // effectGroup にはスパークルの Sprite が 40 個ぶら下がっているため、
      // Mesh だけ見ていると SpriteMaterial と CanvasTexture が漏れる。
      const disposeObject = (object: THREE.Object3D) => {
        if (object instanceof THREE.Sprite) {
          object.material.map?.dispose()
          object.material.dispose()
        } else if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          for (const material of materials) {
            material.dispose()
          }
        }
      }
      effectGroup.traverse(disposeObject)
      if (markerObject) {
        anchor.group.remove(markerObject)
        markerObject.traverse(disposeObject)
      }
      resizeCleanup?.()
      lineArt?.dispose()
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
