import {
  getCachedPoses,
  sortPosesForPlayers,
  sortPosesByMirroredScreenX,
} from "../core/poseService.js";
import { mapVideoKpToCanvas } from "../core/videoFit.js";
import { getCameraFitMode } from "../core/cameraDisplayPrefs.js";

const VICTORY_MS = 5000;
/** Duração da entrada em escala do banner (ease-out-back). */
const BANNER_IN_MS = 720;
/** Fator sobre o tamanho “contain” base (0,7 = 30% mais pequeno). */
const VICTORY_BANNER_SCALE = 0.7;
const KP_NOSE = 0.25;
const CROWN_URL = new URL("../../assets/coroa.png", import.meta.url).href;

const URL_VITORIA_SOLO = new URL("../../assets/end-screen/vitoria.png", import.meta.url).href;
const URL_VITORIA_P1 = new URL("../../assets/end-screen/vitoria_p1.png", import.meta.url).href;
const URL_VITORIA_P2 = new URL("../../assets/end-screen/vitoria_p2.png", import.meta.url).href;
const AUDIO_WIN_URL = new URL("../../assets/audio_win.mp3", import.meta.url).href;

function playWinSound() {
  try {
    const a = new Audio(AUDIO_WIN_URL);
    a.volume = 0.95;
    void a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

function findKp(keypoints, name) {
  return keypoints?.find((k) => k.name === name);
}

/** Easing “back” (overshoot suave). t ∈ [0,1]. */
function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

/**
 * Remove preto sólido do fundo do PNG para sobrepor na câmara.
 * @param {CanvasImageSource} source
 */
function chromaBlackTransparent(source) {
  const w = source.naturalWidth || source.width;
  const h = source.naturalHeight || source.height;
  if (w < 1 || h < 1) return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < 40 && d[i + 1] < 40 && d[i + 2] < 40) {
      d[i + 3] = 0;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return c;
}

/**
 * Ponto na base da coroa (centro inferior do sprite), acima do nariz.
 * @param {import("@tensorflow-models/pose-detection").Pose|null} pose
 */
function crownAnchorFromPose(pose, video, cw, ch) {
  if (!pose?.keypoints || !video) return null;
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const mode = getCameraFitMode();
  const nose = findKp(pose.keypoints, "nose");
  if (!nose || (nose.score ?? 0) < KP_NOSE) return null;
  const le = findKp(pose.keypoints, "left_eye");
  const re = findKp(pose.keypoints, "right_eye");
  const n = mapVideoKpToCanvas(nose, cw, ch, vw, vh, true, mode);
  if (le && re && (le.score ?? 0) >= KP_NOSE && (re.score ?? 0) >= KP_NOSE) {
    const el = mapVideoKpToCanvas(le, cw, ch, vw, vh, true, mode);
    const er = mapVideoKpToCanvas(re, cw, ch, vw, vh, true, mode);
    const eyeMidY = (el.y + er.y) / 2;
    const noseEye = Math.max(10, n.y - eyeMidY);
    return { x: n.x, y: n.y - 2.15 * noseEye };
  }
  return { x: n.x, y: n.y - Math.min(cw, ch) * 0.11 };
}

/**
 * @param {{ mode?: string; winner?: number | null; gameId?: string }} result
 * @param {HTMLVideoElement | null} video
 */
function getWinnerPose(result, video, cw, ch) {
  const poses = getCachedPoses();
  const isBlock = result.gameId === "blockBreaker";
  if (result.mode === "single") {
    const sorted = isBlock
      ? sortPosesByMirroredScreenX(poses, video, cw, ch)
      : sortPosesForPlayers(poses);
    return sorted[0] ?? null;
  }
  const w = result.winner;
  if (w !== 1 && w !== 2) return null;
  const idx = w - 1;
  if (isBlock) {
    return sortPosesByMirroredScreenX(poses, video, cw, ch)[idx] ?? null;
  }
  return sortPosesForPlayers(poses)[idx] ?? null;
}

/**
 * @param {{ mode?: string; winner?: number | null }} result
 */
function victoryBannerSrc(result) {
  if (result.mode === "single") return URL_VITORIA_SOLO;
  if (result.winner === 1) return URL_VITORIA_P1;
  if (result.winner === 2) return URL_VITORIA_P2;
  return URL_VITORIA_SOLO;
}

function createConfetti(w, h, n) {
  const colors = [
    "#f472b6",
    "#a78bfa",
    "#38bdf8",
    "#4ade80",
    "#fbbf24",
    "#fb7185",
    "#facc15",
  ];
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push({
      x: Math.random() * w,
      y: Math.random() * -h * 0.5,
      vx: (Math.random() - 0.5) * 3,
      vy: 2.5 + Math.random() * 4.5,
      r: 3 + Math.random() * 7,
      color: colors[i % colors.length],
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.15,
    });
  }
  return out;
}

/**
 * Ecrã de vitória: confetes, imagem “VITÓRIA!” ao centro (scale ease-out-back), coroa no vencedor; depois `onComplete`.
 * @param {{
 *   video: HTMLVideoElement | null;
 *   result: { mode?: string; winner?: number | null; gameId?: string };
 *   onComplete: () => void;
 * }} opts
 * @returns {Promise<void>}
 */
export function runVictorySequence(opts) {
  const { video, result, onComplete } = opts;

  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.className = "victory-overlay";
    canvas.setAttribute("role", "presentation");
    canvas.setAttribute("aria-hidden", "true");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      onComplete();
      resolve();
      return;
    }

    playWinSound();

    let crownCanvas = /** @type {HTMLCanvasElement | null} */ (null);
    let crownReady = false;
    const crownImg = new Image();
    crownImg.crossOrigin = "anonymous";
    crownImg.onload = () => {
      crownCanvas = chromaBlackTransparent(crownImg);
      crownReady = Boolean(crownCanvas);
    };
    crownImg.onerror = () => {
      crownReady = false;
    };
    crownImg.src = CROWN_URL;

    /** @type {HTMLImageElement | null} */
    let bannerImg = null;
    let bannerReady = false;
    const bannerLoad = new Image();
    bannerLoad.crossOrigin = "anonymous";
    bannerLoad.onload = () => {
      bannerImg = bannerLoad;
      bannerReady = true;
    };
    bannerLoad.onerror = () => {
      bannerReady = false;
    };
    bannerLoad.src = victoryBannerSrc(result);

    let particles = [];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      particles = createConfetti(canvas.width, canvas.height, 96);
    }
    resize();
    window.addEventListener("resize", resize);
    document.body.appendChild(canvas);
    const start = performance.now();
    let rafId = 0;

    function done() {
      window.removeEventListener("resize", resize);
      if (rafId) cancelAnimationFrame(rafId);
      canvas.remove();
      onComplete();
      resolve();
    }

    /**
     * Dimensões do banner no canvas (contain, largura máx. ~88% do ecrã), depois × `VICTORY_BANNER_SCALE`.
     */
    function bannerDrawSize(w, h) {
      if (!bannerImg?.naturalWidth) return { dw: 0, dh: 0 };
      const iw = bannerImg.naturalWidth;
      const ih = bannerImg.naturalHeight;
      const maxW = w * 0.88;
      const maxH = h * 0.55;
      let dw = maxW;
      let dh = (ih / iw) * dw;
      if (dh > maxH) {
        dh = maxH;
        dw = (iw / ih) * dh;
      }
      return { dw: dw * VICTORY_BANNER_SCALE, dh: dh * VICTORY_BANNER_SCALE };
    }

    function tick(now) {
      const elapsed = now - start;
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > h + 20) {
          p.y = -12;
          p.x = Math.random() * w;
        }
        if (p.x < -20) p.x = w + 10;
        if (p.x > w + 20) p.x = -10;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
        ctx.restore();
      }

      const pose = video ? getWinnerPose(result, video, w, h) : null;
      if (crownReady && crownCanvas && pose && video) {
        const anchor = crownAnchorFromPose(pose, video, w, h);
        if (anchor) {
          const eyeL = findKp(pose.keypoints, "left_eye");
          const eyeR = findKp(pose.keypoints, "right_eye");
          let crownW = Math.min(w, h) * 0.2;
          if (eyeL && eyeR && (eyeL.score ?? 0) >= KP_NOSE && (eyeR.score ?? 0) >= KP_NOSE) {
            const vw = video.videoWidth || 1;
            const vh = video.videoHeight || 1;
            const mode = getCameraFitMode();
            const el = mapVideoKpToCanvas(eyeL, w, h, vw, vh, true, mode);
            const er = mapVideoKpToCanvas(eyeR, w, h, vw, vh, true, mode);
            const d = Math.hypot(er.x - el.x, er.y - el.y);
            crownW = Math.max(56, Math.min(Math.min(w, h) * 0.28, d * 2.6));
          }
          const ar = crownCanvas.height / crownCanvas.width;
          const crownH = crownW * ar;
          ctx.drawImage(crownCanvas, anchor.x - crownW / 2, anchor.y - crownH, crownW, crownH);
        }
      }

      const tIn = Math.min(1, elapsed / BANNER_IN_MS);
      const scale = easeOutBack(tIn);

      if (bannerReady && bannerImg && scale > 0) {
        const { dw, dh } = bannerDrawSize(w, h);
        if (dw > 0 && dh > 0) {
          ctx.save();
          ctx.translate(w / 2, h / 2);
          ctx.scale(scale, scale);
          ctx.drawImage(bannerImg, -dw / 2, -dh / 2, dw, dh);
          ctx.restore();
        }
      }

      if (elapsed >= VICTORY_MS) {
        done();
        return;
      }
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
  });
}
