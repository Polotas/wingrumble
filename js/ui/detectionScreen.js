import { getPlayerPoses } from "../core/poseService.js";
import { getCameraFitMode } from "../core/cameraDisplayPrefs.js";
import { mapVideoKpToCanvas } from "../core/videoFit.js";

const POSE_CONNECTIONS = [
  ["nose", "left_eye"],
  ["nose", "right_eye"],
  ["left_eye", "left_ear"],
  ["right_eye", "right_ear"],
  ["left_eye", "right_eye"],
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
];

const KP_MIN_SCORE = 0.25;
const STABLE_FRAMES_NEEDED = 20;

const SKELETON_COLORS = [
  "rgba(0, 255, 200, 0.9)",
  "rgba(255, 180, 80, 0.95)",
];

function findKeypoint(keypoints, name) {
  return keypoints.find((k) => k.name === name);
}

function mapKeypointToCanvas(kp, video, canvas, mirror) {
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  return mapVideoKpToCanvas(
    kp,
    canvas.width,
    canvas.height,
    vw,
    vh,
    mirror,
    getCameraFitMode(),
  );
}

function drawSkeleton(ctx, pose, video, canvas, mirror, strokeStyle, fillStyle) {
  const keypoints = pose.keypoints;
  const byName = (name) => findKeypoint(keypoints, name);

  ctx.lineWidth = 3;
  ctx.strokeStyle = strokeStyle;
  ctx.fillStyle = fillStyle;

  for (const [a, b] of POSE_CONNECTIONS) {
    const ka = byName(a);
    const kb = byName(b);
    if (!ka || !kb || ka.score < KP_MIN_SCORE || kb.score < KP_MIN_SCORE) continue;
    const pa = mapKeypointToCanvas(ka, video, canvas, mirror);
    const pb = mapKeypointToCanvas(kb, video, canvas, mirror);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  for (const kp of keypoints) {
    if (kp.score < KP_MIN_SCORE) continue;
    const p = mapKeypointToCanvas(kp, video, canvas, mirror);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHeadLabel(ctx, pose, video, canvas, mirror, text, color) {
  const nose = findKeypoint(pose.keypoints, "nose");
  if (!nose || nose.score < KP_MIN_SCORE) return;
  const p = mapKeypointToCanvas(nose, video, canvas, mirror);
  ctx.font = "bold 18px system-ui,sans-serif";
  ctx.textAlign = "center";
  const w = ctx.measureText(text).width + 8;
  const h = 22;
  const bx = p.x - w / 2;
  const by = p.y - h - 8;
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.fillRect(bx, by, w, h);
  ctx.strokeRect(bx, by, w, h);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, p.x, p.y - 14);
}

function hasStablePerson(pose) {
  const kp = pose.keypoints;
  const nose = findKeypoint(kp, "nose");
  const ls = findKeypoint(kp, "left_shoulder");
  const rs = findKeypoint(kp, "right_shoulder");
  if (!nose || !ls || !rs) return false;
  return (
    nose.score >= KP_MIN_SCORE &&
    ls.score >= KP_MIN_SCORE &&
    rs.score >= KP_MIN_SCORE
  );
}

/**
 * @param {object} opts
 * @param {HTMLVideoElement} opts.video
 * @param {HTMLCanvasElement} opts.overlayCanvas
 * @param {"single"|"multi"} [opts.gameMode]
 */
export function createDetectionScreen(opts) {
  const { video, overlayCanvas, onStableChange, gameMode = "multi" } = opts;
  const ctx = overlayCanvas.getContext("2d");
  let rafId = 0;
  let stableFrames = 0;
  let lastStable = false;

  function resizeOverlay() {
    const w = Math.round(video.clientWidth || video.getBoundingClientRect().width);
    const h = Math.round(video.clientHeight || video.getBoundingClientRect().height);
    if (w < 2 || h < 2) return;
    overlayCanvas.width = w;
    overlayCanvas.height = h;
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    resizeOverlay();

    const mirror = true;
    let poses = getPlayerPoses();
    if (gameMode === "single") {
      poses = poses.slice(0, 1);
    }
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    const labels = ["P1", "P2"];
    poses.forEach((pose, i) => {
      const stroke = SKELETON_COLORS[i] || "rgba(200,200,200,0.8)";
      const fill =
        i === 0 ? "rgba(255, 255, 80, 0.95)" : "rgba(255, 200, 120, 0.95)";
      drawSkeleton(ctx, pose, video, overlayCanvas, mirror, stroke, fill);
      drawHeadLabel(ctx, pose, video, overlayCanvas, mirror, labels[i], stroke);
    });

    const all = getPlayerPoses();
    if (all.length > 0 && hasStablePerson(all[0])) {
      stableFrames += 1;
    } else {
      stableFrames = 0;
    }

    const stable = stableFrames >= STABLE_FRAMES_NEEDED;
    if (stable !== lastStable) {
      lastStable = stable;
      if (onStableChange) onStableChange(stable);
    }
  }

  return {
    start() {
      resizeOverlay();
      window.addEventListener("resize", resizeOverlay);
      lastStable = false;
      stableFrames = 0;
      rafId = requestAnimationFrame(loop);
    },
    stop() {
      cancelAnimationFrame(rafId);
      rafId = 0;
      window.removeEventListener("resize", resizeOverlay);
      stableFrames = 0;
      lastStable = false;
      ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    },
    isStable() {
      return stableFrames >= STABLE_FRAMES_NEEDED;
    },
  };
}
