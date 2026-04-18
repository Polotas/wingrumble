import { sortPosesByMirroredScreenX } from "../core/poseService.js";
import { getCameraFitMode } from "../core/cameraDisplayPrefs.js";
import { mapVideoKpToCanvas } from "../core/videoFit.js";

const KP_MIN_SCORE = 0.28;

/**
 * @typedef {"single"|"multi"} GameMode
 */

function findKp(keypoints, name) {
  return keypoints?.find((k) => k.name === name) ?? null;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Input Mapping Layer do minigame Collect.
 * Converte pose → estado do cesto (visível + AABB) por jogador.
 */
export function createCollectInputMapper() {
  const basketVisible = [false, false];

  function reset() {
    basketVisible[0] = false;
    basketVisible[1] = false;
  }

  /**
   * @param {object} args
   * @param {import("@tensorflow-models/pose-detection").Pose[]} args.poses
   * @param {HTMLVideoElement} args.video
   * @param {HTMLCanvasElement} args.canvas
   * @param {GameMode} args.mode
   */
  function map({ poses, video, canvas, mode }) {
    const cw = canvas.width || 1;
    const ch = canvas.height || 1;
    const vw = video?.videoWidth || 1;
    const vh = video?.videoHeight || 1;
    const fit = getCameraFitMode();
    const mirror = true;

    const sorted =
      mode === "multi"
        ? sortPosesByMirroredScreenX(poses || [], video, cw, ch).slice(0, 2)
        : (poses || []).slice(0, 1);

    function basketForPlayer(pIdx) {
      const pose = sorted[pIdx];
      const kps = pose?.keypoints;
      const lw = kps ? findKp(kps, "left_wrist") : null;
      const rw = kps ? findKp(kps, "right_wrist") : null;
      const lOk = lw && (lw.score ?? 0) >= KP_MIN_SCORE;
      const rOk = rw && (rw.score ?? 0) >= KP_MIN_SCORE;
      if (!lOk || !rOk) {
        basketVisible[pIdx] = false;
        return {
          visible: false,
          x: 0,
          y: 0,
          w: 0,
          h: 0,
          scoreL: clamp01(lw?.score ?? 0),
          scoreR: clamp01(rw?.score ?? 0),
        };
      }

      const pl = mapVideoKpToCanvas(lw, cw, ch, vw, vh, mirror, fit);
      const pr = mapVideoKpToCanvas(rw, cw, ch, vw, vh, mirror, fit);
      const dx = pr.x - pl.x;
      const dy = pr.y - pl.y;
      const dist = Math.hypot(dx, dy);

      // Thresholds em px relativos ao tamanho do canvas para funcionar em diferentes resoluções.
      const ref = Math.min(cw, ch);
      // Limiar 2x maior (pedido): permite mãos mais afastadas mantendo o cesto.
      const thresholdOn = Math.max(42, ref * 0.12) * 2;
      const thresholdOff = thresholdOn * 1.22;

      const prev = basketVisible[pIdx];
      const visible = prev ? dist < thresholdOff : dist < thresholdOn;
      basketVisible[pIdx] = visible;

      const cx = (pl.x + pr.x) / 2;
      const cy = (pl.y + pr.y) / 2;

      // Tamanho do cesto: proporcional ao ref; levemente influenciado pela distância (mas com limites).
      const baseW = Math.max(78, Math.min(180, ref * 0.26));
      const open = Math.max(0, Math.min(1, (dist - thresholdOn * 0.45) / (thresholdOn * 0.85)));
      const w = baseW * (0.9 + 0.35 * open);
      const h = w * 0.62;

      return {
        visible,
        x: cx,
        y: cy,
        w,
        h,
        scoreL: clamp01(lw.score ?? 0),
        scoreR: clamp01(rw.score ?? 0),
      };
    }

    const p0 = basketForPlayer(0);
    const p1 = mode === "multi" ? basketForPlayer(1) : { visible: false, x: 0, y: 0, w: 0, h: 0 };

    return {
      players: [{ basket: p0 }, { basket: p1 }],
    };
  }

  return { reset, map };
}

