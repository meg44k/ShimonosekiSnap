import * as THREE from 'three'

// 縁だけが光る線画イラスト風の見た目を作るフレネル(縁光り)マテリアル。
// 最初は本体を完全に透明にして輪郭だけ発光させていたが、実際のAR背景は
// (参考イラストの暗い夜空と違って)明るい昼間の橋の写真のため、輪郭線だけ
// では埋もれて見えづらく、クジラの雄大さも伝わらなかった。そのため本体にも
// 半透明の実体を残しつつ、縁だけ強く発光する形に変更した。
// MeshStandardMaterialのシェーダーチャンクをonBeforeCompileで書き換えて
// 実装しているため、GLTFのスケルタルアニメーション(ボーンスキニング)は
// Three.js標準のスキニング処理がそのまま効き、追加対応なしでアニメーションに
// 追従する。
export function createWhaleGlowMaterial(
  bodyColor: THREE.ColorRepresentation = '#1c4a5c',
  rimColor: THREE.ColorRepresentation = '#eaf6ff',
): THREE.Material {
  const material = new THREE.MeshStandardMaterial({
    color: 0x000000,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.bodyColor = { value: new THREE.Color(bodyColor) }
    shader.uniforms.rimColor = { value: new THREE.Color(rimColor) }
    // rimPowerが大きいほど輪郭が細くシャープに、bodyAlphaは正面から見た
    // ときの本体の不透明度(実体感)、rimAlphaは輪郭部分の不透明度(発光の強さ)。
    shader.uniforms.rimPower = { value: 2.2 }
    shader.uniforms.bodyAlpha = { value: 0.4 }
    shader.uniforms.rimAlpha = { value: 1.0 }

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform vec3 bodyColor;
      uniform vec3 rimColor;
      uniform float rimPower;
      uniform float bodyAlpha;
      uniform float rimAlpha;`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `float rim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), rimPower);
      vec3 finalColor = mix(bodyColor, rimColor, rim);
      float finalAlpha = mix(bodyAlpha, rimAlpha, rim);
      gl_FragColor = vec4(finalColor, finalAlpha);
      #include <dithering_fragment>`,
    )
  }

  return material
}
