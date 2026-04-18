import { sortPosesByMirroredScreenX } from "../core/poseService.js";
import { getCameraFitMode } from "../core/cameraDisplayPrefs.js";
import { mapVideoKpToCanvas } from "../core/videoFit.js";

const KP_MIN_SCORE = 0.28;

/**
 * @typedef {"single"|"multi"} GameMode
 * @typedef {"left"|"right"} HandSide
 */

function findKp(keypoints, name) {
  return keypoints?.find((k) => k.name === name) ?? null;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Input Mapping Layer para o minigame de limpeza.
 * Converte pose → posições das mãos em canvas.
 *
 * O jogo consome apenas o resultado desta camada.
 */
export function createCleanInputMapper() {
  function reset() {
    // sem estado interno por agora
  }

  /**
   * @param {object} args
   * @param {import("@tensorflow-models/pose-detection").Pose[]} args.poses
   * @param {HTMLVideoElement} args.video
   * @param {HTMLCanvasElement} args.canvas
   * @param {GameMode} args.mode
   * @param {number} args.nowMs
   */
  function map({ poses, video, canvas, mode, nowMs }) {
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

    const players = [
      { hands: { left: null, right: null }, events: { circleComplete: [] } },
      { hands: { left: null, right: null }, events: { circleComplete: [] } },
    ];

    function mapHand(pIdx, side, kpName) {
      const pose = sorted[pIdx];
      const kp = pose?.keypoints ? findKp(pose.keypoints, kpName) : null;
      const score = kp ? kp.score ?? 0 : 0;
      const visible = score >= KP_MIN_SCORE;
      if (!kp || !visible) {
        players[pIdx].hands[side] = { visible: false, x: 0, y: 0, score: clamp01(score) };
        return;
      }

      // Posição em canvas para o jogo (respeita contain/cover + espelho).
      const p = mapVideoKpToCanvas(kp, cw, ch, vw, vh, mirror, fit);
      players[pIdx].hands[side] = { visible: true, x: p.x, y: p.y, score: clamp01(score) };
    }

    mapHand(0, "left", "left_wrist");
    mapHand(0, "right", "right_wrist");
    if (mode === "multi") {
      mapHand(1, "left", "left_wrist");
      mapHand(1, "right", "right_wrist");
    }

    return {
      players,
    };
  }

  return { reset, map };
}

