// 海面のY座標(マーカー座標系)。whaleAnimation.tsのWAYPOINTSの開始/終了地点の
// Yより上、頂点のYより下に置いた概算値。loadWhaleModel.tsのクリッピング平面と
// splashTrigger.tsの水しぶき発生判定の両方で、同じ「海面の高さ」を参照するため
// 共有定数として切り出している。実機での見た目を見ながら調整する。
export const SEA_LEVEL_Y = -0.07
