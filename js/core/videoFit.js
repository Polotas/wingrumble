/**
 * @typedef {import("./cameraDisplayPrefs.js").CameraFitMode} CameraFitMode
 */

/**
 * Retângulo centrado no alvo onde o frame do vídeo encaixa sem distorção
 * (equivalente a `object-fit: contain` em CSS).
 * @param {number} viewW
 * @param {number} viewH
 * @param {number} vw
 * @param {number} vh
 * @returns {{ dx: number; dy: number; dw: number; dh: number }}
 */
export function getVideoFitRect(viewW, viewH, vw, vh) {
  if (vw < 2 || vh < 2 || viewW < 2 || viewH < 2) {
    return { dx: 0, dy: 0, dw: viewW, dh: viewH };
  }
  const videoAR = vw / vh;
  const viewAR = viewW / viewH;
  let dw;
  let dh;
  if (viewAR > videoAR) {
    dh = viewH;
    dw = viewH * videoAR;
  } else {
    dw = viewW;
    dh = viewW / videoAR;
  }
  const dx = (viewW - dw) / 2;
  const dy = (viewH - dh) / 2;
  return { dx, dy, dw, dh };
}

/**
 * Área onde o jogo/UI deve confinar caixas: letterbox em `contain`, ecrã inteiro em `cover`.
 * @param {number} viewW
 * @param {number} viewH
 * @param {number} vw
 * @param {number} vh
 * @param {CameraFitMode} mode
 * @returns {{ x: number; y: number; w: number; h: number }}
 */
export function getVideoLayoutRect(viewW, viewH, vw, vh, mode) {
  if (vw < 2 || vh < 2 || viewW < 2 || viewH < 2) {
    return { x: 0, y: 0, w: viewW, h: viewH };
  }
  if (mode === "cover") {
    return { x: 0, y: 0, w: viewW, h: viewH };
  }
  const r = getVideoFitRect(viewW, viewH, vw, vh);
  return { x: r.dx, y: r.dy, w: r.dw, h: r.dh };
}

/**
 * Keypoint em coords do vídeo → canvas/overlay (alinhado a object-fit contain/cover + espelho opcional).
 * @param {{ x: number; y: number }} kp
 * @param {number} viewW
 * @param {number} viewH
 * @param {number} vw
 * @param {number} vh
 * @param {boolean} mirror
 * @param {CameraFitMode} mode
 */
export function mapVideoKpToCanvas(kp, viewW, viewH, vw, vh, mirror, mode) {
  let x;
  let y;
  if (vw < 2 || vh < 2 || viewW < 2 || viewH < 2) {
    x = (kp.x / Math.max(vw, 1)) * viewW;
    y = (kp.y / Math.max(vh, 1)) * viewH;
  } else if (mode === "cover") {
    const scale = Math.max(viewW / vw, viewH / vh);
    const dispW = vw * scale;
    const dispH = vh * scale;
    const dx = (viewW - dispW) / 2;
    const dy = (viewH - dispH) / 2;
    x = dx + kp.x * scale;
    y = dy + kp.y * scale;
  } else {
    const { dx, dy, dw, dh } = getVideoFitRect(viewW, viewH, vw, vh);
    x = dx + kp.x * (dw / vw);
    y = dy + kp.y * (dh / vh);
  }
  if (mirror) x = viewW - x;
  return { x, y };
}
