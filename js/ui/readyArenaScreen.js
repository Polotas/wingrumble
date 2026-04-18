import { getCachedPoses } from "../core/poseService.js";
import {
  CAMERA_FIT_CHANGE_EVENT,
  CAMERA_FIT_CONTAIN,
  CAMERA_FIT_COVER,
  getCameraFitMode,
  setCameraFitMode,
} from "../core/cameraDisplayPrefs.js";
import { mapVideoKpToCanvas } from "../core/videoFit.js";

const NOSE_MIN_SCORE = 0.25;
const HAND_MIN_SCORE = 0.28;
/** Frames consecutivos com condições OK antes do temporizador (~350–450 ms a 60 Hz). */
const READY_FRAMES_NEEDED = 22;
/** Após estar pronto, espera antes de ir ao jogo e iniciar a contagem 3-2-1. */
const POST_READY_DELAY_MS = 3000;

const STATUS_USER_DETECTED = "Utilizador detectado";

/**
 * @param {import("@tensorflow-models/pose-detection").Keypoint[]} keypoints
 * @param {string} name
 */
function findKp(keypoints, name) {
  return keypoints.find((k) => k.name === name);
}

/**
 * @param {import("@tensorflow-models/pose-detection").Pose} pose
 */
function hasHandVisible(pose) {
  const lw = findKp(pose.keypoints, "left_wrist");
  const rw = findKp(pose.keypoints, "right_wrist");
  return (
    ((lw?.score ?? 0) >= HAND_MIN_SCORE) || ((rw?.score ?? 0) >= HAND_MIN_SCORE)
  );
}

/**
 * X do nariz no overlay (já espelhado), alinhado a contain/cover.
 */
function noseScreenX(pose, video, cw, ch, fitMode) {
  const nose = findKp(pose.keypoints, "nose");
  if (!nose || (nose.score ?? 0) < NOSE_MIN_SCORE) return null;
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  return mapVideoKpToCanvas(nose, cw, ch, vw, vh, true, fitMode).x;
}

/**
 * @param {object} opts
 * @param {HTMLVideoElement} opts.video
 * @param {HTMLCanvasElement} opts.overlayCanvas
 * @param {"single"|"multi"} opts.gameMode
 * @param {HTMLElement} [opts.statusTextEl] — parágrafo de estado no painel
 * @param {string} [opts.statusBaseText] — texto quando ainda não há pose válida
 * @param {() => void} opts.onReady — chamado uma vez quando estável; deve parar este ecrã no handler.
 */
export function createReadyArenaScreen(opts) {
  const {
    video,
    overlayCanvas,
    gameMode = "multi",
    onReady,
    statusTextEl,
    statusBaseText,
  } = opts;
  const ctx = overlayCanvas.getContext("2d");
  let rafId = 0;
  let readyFrames = 0;
  let fired = false;
  /** Após `readyFrames >= READY_FRAMES_NEEDED`, instante em que começou a espera de 3 s. */
  let delayStartMs = 0;

  const btnContain = document.getElementById("btn-camera-fit-contain");
  const btnCover = document.getElementById("btn-camera-fit-cover");

  function syncVideoFitClass() {
    const mode = getCameraFitMode();
    video.classList.remove("camera-fit--contain", "camera-fit--cover");
    video.classList.add(mode === CAMERA_FIT_COVER ? "camera-fit--cover" : "camera-fit--contain");
    if (btnContain && btnCover) {
      const isContain = mode === CAMERA_FIT_CONTAIN;
      btnContain.classList.toggle("camera-fit-toggle__btn--active", isContain);
      btnCover.classList.toggle("camera-fit-toggle__btn--active", !isContain);
      btnContain.setAttribute("aria-pressed", isContain ? "true" : "false");
      btnCover.setAttribute("aria-pressed", !isContain ? "true" : "false");
    }
  }

  function onCameraFitChanged() {
    syncVideoFitClass();
    resizeOverlay();
  }

  function onContainClick() {
    setCameraFitMode(CAMERA_FIT_CONTAIN);
    onCameraFitChanged();
  }

  function onCoverClick() {
    setCameraFitMode(CAMERA_FIT_COVER);
    onCameraFitChanged();
  }

  function resizeOverlay() {
    const w = Math.round(video.clientWidth || video.getBoundingClientRect().width);
    const h = Math.round(video.clientHeight || video.getBoundingClientRect().height);
    if (w < 2 || h < 2) return;
    overlayCanvas.width = w;
    overlayCanvas.height = h;
  }

  function checkReady() {
    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (vw < 2 || vh < 2) return false;

    const cw = overlayCanvas.width;
    const ch = overlayCanvas.height;
    if (cw < 4 || ch < 4) return false;

    const fitMode = getCameraFitMode();
    const poses = getCachedPoses();
    if (!poses?.length) return false;

    if (gameMode === "single") {
      const p = poses[0];
      return Boolean(p && hasHandVisible(p));
    }

    const mid = cw / 2;
    let leftOk = false;
    let rightOk = false;
    for (const pose of poses.slice(0, 2)) {
      if (!hasHandVisible(pose)) continue;
      const nx = noseScreenX(pose, video, cw, ch, fitMode);
      if (nx === null) continue;
      if (nx < mid) leftOk = true;
      else rightOk = true;
    }
    return leftOk && rightOk;
  }

  function drawWristHints(cw, ch) {
    const vw = video.videoWidth || 1;
    const vh = video.videoHeight || 1;
    const fitMode = getCameraFitMode();
    const raw = getCachedPoses();
    const poses = gameMode === "single" ? raw.slice(0, 1) : raw.slice(0, 2);

    for (const pose of poses) {
      for (const name of ["left_wrist", "right_wrist"]) {
        const kp = findKp(pose.keypoints, name);
        if (!kp || (kp.score ?? 0) < HAND_MIN_SCORE) continue;
        const { x, y } = mapVideoKpToCanvas(kp, cw, ch, vw, vh, true, fitMode);
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(250, 204, 21, 0.92)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  function draw() {
    resizeOverlay();
    const cw = overlayCanvas.width;
    const ch = overlayCanvas.height;
    if (cw < 2 || ch < 2) return;

    ctx.clearRect(0, 0, cw, ch);

    if (gameMode === "multi") {
      // Linha divisória (centro) + badges P1/P2 com estilo de painel.
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cw / 2, 0);
      ctx.lineTo(cw / 2, ch);
      ctx.stroke();

      const topY = Math.min(52, ch * 0.09);
      const badgeH = Math.round(Math.min(44, Math.max(30, cw * 0.06)));
      const badgeW = Math.round(Math.min(140, Math.max(92, cw * 0.18)));
      const r = Math.round(Math.min(16, Math.max(10, badgeH * 0.36)));

      function roundRect(x, y, w, h, radius) {
        const rr = Math.min(radius, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
      }

      /**
       * @param {number} cx
       * @param {string} label
       * @param {string} fill
       */
      function drawBadge(cx, label, fill) {
        const x = Math.round(cx - badgeW / 2);
        const y = Math.round(topY - badgeH / 2);

        // Sombra “drop” do painel (game-panel-stack).
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = "#2f2941";
        roundRect(x, y + 5, badgeW, badgeH, r);
        ctx.fill();

        // Fundo do painel.
        ctx.fillStyle = fill;
        roundRect(x, y, badgeW, badgeH, r);
        ctx.fill();

        // Borda + highlight interno.
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#2f2941";
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#f5f2ff";
        roundRect(x + 2, y + 2, badgeW - 4, badgeH - 4, Math.max(0, r - 2));
        ctx.stroke();

        const fontPx = Math.round(Math.min(22, Math.max(14, badgeH * 0.46)));
        ctx.font = `900 ${fontPx}px system-ui,sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#2f2941";
        ctx.fillText(label, cx, y + badgeH / 2 + 1);
        ctx.restore();
      }

      // P1 à esquerda (tela), P2 à direita (tela).
      drawBadge(cw * 0.25, "P1", "#bfdbfe");
      drawBadge(cw * 0.75, "P2", "#fecaca");
    }

    drawWristHints(cw, ch);

    const ok = checkReady();
    const hintPx = Math.round(Math.min(16, Math.max(12, cw * 0.022)));
    ctx.font = `600 ${hintPx}px system-ui,sans-serif`;
    ctx.fillStyle = ok ? "rgba(52, 211, 153, 0.98)" : "rgba(248, 250, 252, 0.88)";
    ctx.textAlign = "center";
    let hint;
    if (ok && readyFrames >= READY_FRAMES_NEEDED && delayStartMs > 0) {
      const leftSec = Math.max(
        0,
        Math.ceil((POST_READY_DELAY_MS - (performance.now() - delayStartMs)) / 1000),
      );
      hint =
        leftSec > 0
          ? `Pronto — contagem em ${leftSec}…`
          : "A iniciar…";
    } else if (ok) {
      hint = "Pronto — aguarde 3 segundos";
    } else {
      hint =
        gameMode === "single"
          ? "Posicione o corpo para inciiar o jogo"
          : "P1 à esquerda e P2 à direita — ambos com mão visível";
    }
    ctx.fillText(hint, cw / 2, ch - Math.max(16, ch * 0.04));
  }

  function syncPanelStatusText() {
    if (!statusTextEl || typeof statusBaseText !== "string") return;
    statusTextEl.textContent = checkReady() ? STATUS_USER_DETECTED : statusBaseText;
  }

  function loop() {
    if (fired) return;

    const ok = checkReady();
    if (ok) {
      readyFrames += 1;
      if (readyFrames >= READY_FRAMES_NEEDED && delayStartMs <= 0) {
        delayStartMs = performance.now();
      }
    } else {
      readyFrames = 0;
      delayStartMs = 0;
    }

    draw();
    syncPanelStatusText();

    if (
      ok &&
      readyFrames >= READY_FRAMES_NEEDED &&
      delayStartMs > 0 &&
      performance.now() - delayStartMs >= POST_READY_DELAY_MS
    ) {
      fired = true;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      if (onReady) onReady();
      return;
    }

    rafId = requestAnimationFrame(loop);
  }

  return {
    start() {
      fired = false;
      readyFrames = 0;
      delayStartMs = 0;
      syncVideoFitClass();
      btnContain?.addEventListener("click", onContainClick);
      btnCover?.addEventListener("click", onCoverClick);
      window.addEventListener(CAMERA_FIT_CHANGE_EVENT, onCameraFitChanged);
      resizeOverlay();
      window.addEventListener("resize", resizeOverlay);
      rafId = requestAnimationFrame(loop);
    },
    stop() {
      fired = true;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      window.removeEventListener("resize", resizeOverlay);
      window.removeEventListener(CAMERA_FIT_CHANGE_EVENT, onCameraFitChanged);
      btnContain?.removeEventListener("click", onContainClick);
      btnCover?.removeEventListener("click", onCoverClick);
      ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    },
  };
}
