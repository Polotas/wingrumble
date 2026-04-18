import { getPlayerPoses } from "../../core/poseService.js";
import { createMotionAnalyzer } from "../../core/motionAnalyzer.js";

const RACE_DISTANCE_M = 100;
const MAX_SPEED_M_S = 10.5;
const GROUND_RATIO = 0.22;
const LANE_GAP = 48;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} [options]
 * @param {HTMLVideoElement} [options.video]
 * @param {HTMLCanvasElement} [options.previewOverlay]
 * @param {"single"|"multi"} [options.mode]
 * @param {(result: { winner: 1 | 2; timeSec: number; timeP1: number; timeP2: number; mode: "single"|"multi" }) => void} [options.onFinish]
 */
export function createSprintGame(canvas, options = {}) {
  const ctx = canvas.getContext("2d");
  const { onFinish, video, previewOverlay, mode = "multi" } = options;
  let gameplayPaused = false;
  const single = mode === "single";
  const pctx = previewOverlay ? previewOverlay.getContext("2d") : null;

  const motion1 = createMotionAnalyzer();
  const motion2 = createMotionAnalyzer();

  let distance1 = 0;
  let distance2 = 0;
  let finished = false;
  let startTime = 0;
  let lastT = 0;
  let rafId = 0;
  let timeP1Finish = 0;
  let timeP2Finish = 0;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function resizePreviewOverlay() {
    if (!previewOverlay || !video || !pctx) return;
    const w = Math.round(video.clientWidth || 1);
    const h = Math.round(video.clientHeight || 1);
    if (w < 2 || h < 2) return;
    previewOverlay.width = w;
    previewOverlay.height = h;
  }

  function groundY() {
    return canvas.height * (1 - GROUND_RATIO);
  }

  function drawTrack() {
    const gy = groundY();
    const w = canvas.width;

    ctx.fillStyle = "#1a2d1a";
    ctx.fillRect(0, gy, w, canvas.height - gy);

    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    if (!single) {
      ctx.beginPath();
      ctx.moveTo(0, gy - LANE_GAP);
      ctx.lineTo(w, gy - LANE_GAP);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.moveTo(0, gy - 2);
    ctx.lineTo(w, gy - 2);
    ctx.stroke();

    const finishX = w * 0.88;
    ctx.fillStyle = "rgba(255, 220, 80, 0.35)";
    ctx.fillRect(finishX, gy - 130, 10, 130);
    ctx.fillStyle = "#eee";
    ctx.font = "bold 13px system-ui,sans-serif";
    ctx.save();
    ctx.translate(finishX + 4, gy - 48);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("CHEGADA", 0, 0);
    ctx.restore();
  }

  function drawRunner(x, gyLane, playerIndex) {
    const scale = Math.min(1, canvas.width / 560);
    const footY = gyLane - 4;
    const bodyW = 20 * scale;
    const bodyH = 34 * scale;
    const headR = 12 * scale;
    const bodyX = x - bodyW / 2;
    const bodyTop = footY - bodyH - headR * 1.5;

    const headFill = playerIndex === 0 ? "#7dd3fc" : "#fdba74";
    const bodyFill = playerIndex === 0 ? "#2563eb" : "#ea580c";

    ctx.fillStyle = headFill;
    ctx.beginPath();
    ctx.arc(x, bodyTop + headR * 0.85, headR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = bodyFill;
    ctx.fillRect(bodyX, bodyTop + headR * 1.1, bodyW, bodyH);

    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 3 * scale;
    ctx.lineCap = "round";
    const armY = bodyTop + headR * 1.2 + bodyH * 0.22;
    ctx.beginPath();
    ctx.moveTo(bodyX, armY);
    ctx.lineTo(bodyX - 16 * scale, armY - 6 * scale);
    ctx.moveTo(bodyX + bodyW, armY);
    ctx.lineTo(bodyX + bodyW + 18 * scale, armY - 5 * scale);
    ctx.stroke();

    const legY = footY - 5 * scale;
    ctx.beginPath();
    ctx.moveTo(x - 5 * scale, bodyTop + headR * 1.1 + bodyH);
    ctx.lineTo(x - 8 * scale, legY);
    ctx.moveTo(x + 5 * scale, bodyTop + headR * 1.1 + bodyH);
    ctx.lineTo(x + 10 * scale, legY);
    ctx.stroke();
  }

  function drawHudSingle(elapsedSec, i1, d1) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(12, 12, 280, 78);
    ctx.font = "600 18px system-ui,sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#7dd3fc";
    ctx.fillText(`P1  ${d1.toFixed(1)} m`, 24, 42);
    ctx.font = "13px system-ui,sans-serif";
    ctx.fillStyle = "#334155";
    ctx.fillRect(24, 50, 220, 6);
    ctx.fillStyle = i1 > 0.08 ? "#22c55e" : "#475569";
    ctx.fillRect(24, 50, 220 * i1, 6);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "14px system-ui,sans-serif";
    ctx.fillText(`Tempo: ${elapsedSec.toFixed(2)} s`, 24, 72);
  }

  function drawHudMulti(elapsedSec, i1, i2, d1, d2) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(12, 12, 300, 108);
    ctx.font = "600 18px system-ui,sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#7dd3fc";
    ctx.fillText(`P1  ${d1.toFixed(1)} m`, 24, 42);
    ctx.font = "13px system-ui,sans-serif";
    ctx.fillStyle = "#334155";
    ctx.fillRect(24, 50, 240, 6);
    ctx.fillStyle = i1 > 0.08 ? "#22c55e" : "#475569";
    ctx.fillRect(24, 50, 240 * i1, 6);

    ctx.font = "600 18px system-ui,sans-serif";
    ctx.fillStyle = "#fdba74";
    ctx.fillText(`P2  ${d2.toFixed(1)} m`, 24, 88);
    ctx.fillStyle = "#334155";
    ctx.fillRect(24, 96, 240, 6);
    ctx.fillStyle = i2 > 0.08 ? "#22c55e" : "#475569";
    ctx.fillRect(24, 96, 240 * i2, 6);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "14px system-ui,sans-serif";
    ctx.fillText(`Tempo: ${elapsedSec.toFixed(2)} s`, 24, 118);
  }

  function findKp(kps, name) {
    return kps.find((k) => k.name === name);
  }

  function drawPreviewPlayerTags() {
    if (!pctx || !video || !previewOverlay) return;
    resizePreviewOverlay();
    pctx.clearRect(0, 0, previewOverlay.width, previewOverlay.height);
    let poses = getPlayerPoses();
    if (single) poses = poses.slice(0, 1);
    const mirror = true;
    const labels = ["P1", "P2"];
    const colors = ["#34d399", "#fb923c"];

    poses.forEach((pose, i) => {
      const nose = findKp(pose.keypoints, "nose");
      if (!nose || nose.score < 0.2) return;
      const vw = video.videoWidth || 1;
      const vh = video.videoHeight || 1;
      const sx = previewOverlay.width / vw;
      const sy = previewOverlay.height / vh;
      let x = nose.x * sx;
      const y = nose.y * sy;
      if (mirror) x = previewOverlay.width - x;
      const text = labels[i];
      pctx.font = "bold 14px system-ui,sans-serif";
      const tw = pctx.measureText(text).width + 8;
      pctx.fillStyle = "rgba(0,0,0,0.7)";
      pctx.strokeStyle = colors[i];
      pctx.lineWidth = 2;
      pctx.fillRect(x - tw / 2, y - 28, tw, 22);
      pctx.strokeRect(x - tw / 2, y - 28, tw, 22);
      pctx.fillStyle = "#fff";
      pctx.textAlign = "center";
      pctx.fillText(text, x, y - 12);
    });
  }

  function gameLoop(t) {
    if (finished) return;

    if (!gameplayPaused && !startTime) startTime = t;
    const dtSec =
      !gameplayPaused && lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
    lastT = t;

    const players = getPlayerPoses();
    const pose1 = players[0] || null;
    const pose2 = single ? null : players[1] || null;

    motion1.pushPose(pose1);
    motion2.pushPose(pose2);

    let { intensity: i1 } = motion1.getRunningState();
    let { intensity: i2 } = motion2.getRunningState();
    if (!pose1 || !Array.isArray(pose1.keypoints)) i1 = 0;
    if (single) i2 = 0;
    else if (!pose2 || !Array.isArray(pose2.keypoints)) i2 = 0;

    if (distance1 < RACE_DISTANCE_M && dtSec > 0) {
      distance1 += MAX_SPEED_M_S * i1 * dtSec;
      if (distance1 >= RACE_DISTANCE_M) {
        distance1 = RACE_DISTANCE_M;
        if (!timeP1Finish) timeP1Finish = (t - startTime) / 1000;
      }
    }
    if (!single && distance2 < RACE_DISTANCE_M && dtSec > 0) {
      distance2 += MAX_SPEED_M_S * i2 * dtSec;
      if (distance2 >= RACE_DISTANCE_M) {
        distance2 = RACE_DISTANCE_M;
        if (!timeP2Finish) timeP2Finish = (t - startTime) / 1000;
      }
    }

    const gy = groundY();
    const gyP1 = single ? gy - LANE_GAP / 2 - 8 : gy - LANE_GAP;
    const gyP2 = gy - 6;
    const elapsedSec = startTime ? (t - startTime) / 1000 : 0;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvas.width, gy);

    drawTrack();

    const margin = canvas.width * 0.08;
    const runW = canvas.width * 0.84;
    const prog1 = Math.min(1, distance1 / RACE_DISTANCE_M);
    const prog2 = Math.min(1, distance2 / RACE_DISTANCE_M);
    const x1 = margin + prog1 * runW;
    const x2 = margin + prog2 * runW;

    drawRunner(x1, gyP1, 0);
    if (!single) drawRunner(x2, gyP2, 1);

    if (single) drawHudSingle(elapsedSec, i1, distance1);
    else drawHudMulti(elapsedSec, i1, i2, distance1, distance2);

    drawPreviewPlayerTags();

    const p1Done = distance1 >= RACE_DISTANCE_M;
    const p2Done = single ? false : distance2 >= RACE_DISTANCE_M;

    if (!finished && (single ? p1Done : p1Done || p2Done)) {
      finished = true;
      let winner = /** @type {1|2} */ (1);
      if (single) {
        winner = 1;
      } else if (p1Done && p2Done) {
        winner = timeP1Finish <= timeP2Finish ? 1 : 2;
      } else if (p2Done) {
        winner = 2;
      }
      if (onFinish) {
        onFinish({
          gameId: "sprint100m",
          winner,
          timeSec: elapsedSec,
          timeP1: timeP1Finish || elapsedSec,
          timeP2: single ? 0 : timeP2Finish || 0,
          mode: single ? "single" : "multi",
        });
      }
      return;
    }

    if (!finished) {
      ctx.fillStyle = "rgba(248,250,252,0.88)";
      ctx.font = "14px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        single
          ? "P1 = primeira pessoa detectada · corra no lugar"
          : "P1 = pessoa mais à esquerda · P2 = mais à direita · corram no lugar",
        canvas.width / 2,
        32
      );
    }

    rafId = requestAnimationFrame(gameLoop);
  }

  function resumeGameplay() {
    gameplayPaused = false;
  }

  return {
    /** @param {{ startPaused?: boolean }} [opts] */
    start(opts = {}) {
      gameplayPaused = opts.startPaused === true;
      motion1.reset();
      motion2.reset();
      distance1 = 0;
      distance2 = 0;
      finished = false;
      startTime = 0;
      lastT = 0;
      timeP1Finish = 0;
      timeP2Finish = 0;
      resize();

      window.addEventListener("resize", resize);
      if (video) window.addEventListener("resize", resizePreviewOverlay);
      rafId = requestAnimationFrame(gameLoop);
    },
    resumeGameplay,
    stop() {
      cancelAnimationFrame(rafId);
      rafId = 0;
      window.removeEventListener("resize", resize);
      if (video) window.removeEventListener("resize", resizePreviewOverlay);
      finished = true;
      gameplayPaused = false;
    },
  };
}
