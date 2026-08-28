import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

export function quantizeTime(elapsedMs: number, hz: number): number {
  return Math.floor((elapsedMs / 1000) * hz)
}

export interface RenderTargetSize {
  width: number
  height: number
}

export function resolveRenderTargetSize(
  cssWidth: number,
  cssHeight: number,
  pixelRatio: number,
  options: { maxPixelRatio?: number; scale?: number } = {},
): RenderTargetSize {
  const { maxPixelRatio = 2, scale = 1 } = options
  const ratio = Math.min(pixelRatio, maxPixelRatio) * scale
  return {
    width: Math.max(1, Math.round(cssWidth * ratio)),
    height: Math.max(1, Math.round(cssHeight * ratio)),
  }
}

export const WHALE_LINEART_LAYER = 1

// --- チューニング用パラメータ(実機で調整。Task 7) ---
const BOIL_HZ = 8 // 線のゆらぎの更新頻度(回/秒)
const BOIL_AMP = 1.6 // ゆらぎの振幅(テクセル)
const BOIL_CELLS = 6.0 // boil のオフセットを共有する空間セルの分割数(小さいほど広い領域が一緒に動く)
// 参考イラストは「クリーンな輪郭(シルエット)線 + ごく少数の折れ線」。
// シルエットは深度勾配ではなく「隣が背景か」で判定する(シェーダー参照)ので
// 丸い体に偽の等高線が出ない。内側は法線の硬い不連続だけを線にする。
const DEPTH_THRESHOLD = 0.08 // 現在シェーダー未使用(背景有無でシルエット判定するため)。将来用に残置
const NORMAL_THRESHOLD = 0.7 // 法線エッジのしきい値。高いほど内側の線が減る(硬い折れだけ)
const HALO_RADIUS = 1.8 // ハローの膨張半径(テクセル)。線の外側の暗いにじみの太さ
const HALO_ALPHA = 0.34 // ハローの不透明度
const LINE_COLOR = new THREE.Color('#eaf6ff') // 線の色(ほぼ白)
const HALO_COLOR = new THREE.Color('#0a1a2a') // ハローの色(暗い紺)
const RT_SCALE = 1 // 1 未満にするとエッジパスを低解像度化して負荷を下げる

const EDGE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const EDGE_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tNormal;
  uniform sampler2D tDepth;
  uniform vec2 uResolution;
  uniform float uNear;
  uniform float uFar;
  uniform float uStep;
  uniform vec3 uLineColor;
  uniform vec3 uHaloColor;
  uniform float uHaloAlpha;
  uniform float uHaloRadius;
  uniform float uDepthThreshold;
  uniform float uNormalThreshold;
  uniform float uBoilAmp;
  uniform float uBoilCells;

  // 非線形の遠近深度(0..1)を線形のビューZ(負値)に変換する
  float linearizeDepth(float d) {
    return (uNear * uFar) / ((uFar - uNear) * d - uFar);
  }

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // リニア色を sRGB へ変換する(出力先フレームバッファが sRGB のため)
  vec3 linearToSRGB(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }

  void main() {
    vec2 texel = 1.0 / uResolution;

    // boil: 数コマに1回だけ変わる、領域(セル)ごとに共通のオフセット。
    // ピクセル単位のノイズにならないよう hash 入力を空間量子化する。
    vec2 cell = floor(vUv * uBoilCells);
    vec2 boil = (vec2(
      hash12(cell + uStep),
      hash12(cell + uStep + 19.7)
    ) - 0.5) * uBoilAmp * texel;
    vec2 uv = vUv + boil;

    // 深度テクスチャは背景(クジラなし)が 1.0 でクリアされている。
    // 「輪郭(縁取り)」= 中心がクジラ上で、3x3 の隣に背景がある画素。
    // 深度勾配のしきい値ではなく背景の有無で判定するので、丸い体の面が
    // 視線とすれすれになる所に出ていた偽の等高線(前バージョンで eDepth が
    // 拾っていた「体の形の線」)が出なくなる。
    float BG = 0.9999;
    float rawC = texture2D(tDepth, uv).r;
    float fg = step(rawC, BG); // 中心はクジラの上か

    vec3 n[9];
    float bgNeighbor = 0.0;
    int k = 0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y)) * texel;
        n[k] = texture2D(tNormal, uv + o).rgb * 2.0 - 1.0;
        bgNeighbor = max(bgNeighbor, step(BG, texture2D(tDepth, uv + o).r));
        k++;
      }
    }
    float silhouette = fg * bgNeighbor;

    // 内側の線は「本物の折れ(法線の不連続)」だけ。なめらかな曲面には出ない。
    vec3 gxN = n[0] + 2.0 * n[3] + n[6] - n[2] - 2.0 * n[5] - n[8];
    vec3 gyN = n[0] + 2.0 * n[1] + n[2] - n[6] - 2.0 * n[7] - n[8];
    float normalEdge = max(length(gxN), length(gyN));
    float eNormal = fg * smoothstep(uNormalThreshold, uNormalThreshold * 2.0, normalEdge);

    float lineCore = max(silhouette, eNormal);

    // ハロー: 中心が背景で、少し内側にクジラがある画素。白い線の外側に
    // 暗いにじみを出して明るい写真の上でも視認できるようにする。
    float bgC = step(BG, rawC);
    float haloOut = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) / 8.0 * 6.2831853;
      vec2 o = vec2(cos(a), sin(a)) * texel * uHaloRadius;
      haloOut = max(haloOut, step(texture2D(tDepth, uv + o).r, BG));
    }
    float halo = max(lineCore, bgC * haloOut);

    vec3 rgb = mix(uHaloColor, uLineColor, lineCore);
    float alpha = clamp(max(lineCore, halo * uHaloAlpha), 0.0, 1.0);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(linearToSRGB(rgb), alpha);
  }
`

export interface LineArtRenderer {
  setSize(cssWidth: number, cssHeight: number, pixelRatio: number): void
  setClippingPlanes(planes: THREE.Plane[] | null): void
  renderLineArt(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    elapsedMs: number,
  ): void
  dispose(): void
}

export function createLineArtRenderer(): LineArtRenderer {
  const normalTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: true,
    depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
    minFilter: THREE.NearestFilter,
    // 高dpr端末では MindAR が dpr をクランプしないため、フルスクリーンの
    // エッジ矩形が RT テクスチャを拡大表示することがある。Nearest だと
    // 線がジャギーになるので拡大は Linear にする(縮小は Nearest のまま。
    // 付随する DepthTexture のフィルタはコンストラクタ側の設定を維持)。
    magFilter: THREE.LinearFilter,
  })

  const normalMaterial = new THREE.MeshNormalMaterial()
  // MeshNormalMaterial は SkinnedMesh に対して自動でスキニングされる(three r160)。
  // 遊泳変形は法線バッファに反映される。
  // クリッピングは material.clippingPlanes(setClippingPlanes で設定)と
  // renderer.localClippingEnabled(ArCameraView 側で有効化)で駆動されるため、
  // ここで .clipping フラグを立てる必要はない。

  const uniforms = {
    tNormal: { value: normalTarget.texture },
    tDepth: { value: normalTarget.depthTexture },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.01 },
    uFar: { value: 1000 },
    uStep: { value: 0 },
    uLineColor: { value: LINE_COLOR },
    uHaloColor: { value: HALO_COLOR },
    uHaloAlpha: { value: HALO_ALPHA },
    uHaloRadius: { value: HALO_RADIUS },
    uDepthThreshold: { value: DEPTH_THRESHOLD },
    uNormalThreshold: { value: NORMAL_THRESHOLD },
    uBoilAmp: { value: BOIL_AMP },
    uBoilCells: { value: BOIL_CELLS },
  }

  const edgeMaterial = new THREE.ShaderMaterial({
    vertexShader: EDGE_VERT,
    fragmentShader: EDGE_FRAG,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const fsQuad = new FullScreenQuad(edgeMaterial)

  return {
    // internals exposed for tests only
    _normalTarget: normalTarget,

    setSize(cssWidth, cssHeight, pixelRatio) {
      const { width, height } = resolveRenderTargetSize(cssWidth, cssHeight, pixelRatio, {
        maxPixelRatio: 2,
        scale: RT_SCALE,
      })
      normalTarget.setSize(width, height)
      normalTarget.depthTexture.image.width = width
      normalTarget.depthTexture.image.height = height
      uniforms.uResolution.value.set(width, height)
    },

    setClippingPlanes(planes) {
      normalMaterial.clippingPlanes = planes
    },

    renderLineArt(renderer, scene, camera, elapsedMs) {
      const savedMask = camera.layers.mask
      const savedTarget = renderer.getRenderTarget()

      // --- 法線プリパス ---
      renderer.setRenderTarget(normalTarget)
      renderer.setClearColor(0x000000, 0)
      renderer.clear(true, true, false)
      scene.overrideMaterial = normalMaterial
      camera.layers.set(WHALE_LINEART_LAYER)
      renderer.render(scene, camera)
      scene.overrideMaterial = null
      camera.layers.mask = savedMask
      renderer.setRenderTarget(savedTarget)

      // --- エッジ検出パス(現在バインドされている描画先へ) ---
      uniforms.uNear.value = camera.near
      uniforms.uFar.value = camera.far
      uniforms.uStep.value = quantizeTime(elapsedMs, BOIL_HZ)
      fsQuad.render(renderer)
    },

    dispose() {
      normalTarget.dispose()
      normalTarget.depthTexture.dispose()
      normalMaterial.dispose()
      edgeMaterial.dispose()
      fsQuad.dispose()
    },
  } as LineArtRenderer & { _normalTarget: THREE.WebGLRenderTarget }
}
