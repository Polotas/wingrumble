/**
 * TF.js + pose-detection (script global). MoveNet MultiPose + WebGL (GPU).
 */

import { mapVideoKpToCanvas } from "./videoFit.js";
import { getCameraFitMode } from "./cameraDisplayPrefs.js";

const INFERENCE_INTERVAL_MS = 1000 / 30;

let detector = null;
let cachedPoses = [];
let inferenceHandle = 0;
let inferring = false;
let lastInferenceTime = 0;
let videoEl = null;

function findNoseX(pose) {
  if (!pose?.keypoints) return 0;
  const n = pose.keypoints.find((k) => k.name === "nose");
  return n ? n.x : 0;
}

/** Ordena da esquerda para a direita no frame da câmera (P1 = mais à esquerda). */
export function sortPosesForPlayers(poses) {
  if (!poses?.length) return [];
  return [...poses].sort((a, b) => findNoseX(a) - findNoseX(b));
}

/** Até 2 poses ordenadas para P1 / P2 */
export function getPlayerPoses() {
  return sortPosesForPlayers(cachedPoses).slice(0, 2);
}

/**
 * Ordena poses como no ecrã espelhado (selfie): menor X visível = mais à esquerda = P1.
 * @param {import("@tensorflow-models/pose-detection").Pose[]} poses
 */
export function sortPosesByMirroredScreenX(poses, video, viewWidthPx, viewHeightPx) {
  if (!poses?.length || !video || viewWidthPx < 4 || viewHeightPx < 4) {
    return [...(poses || [])];
  }
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  if (vw < 2) return [...poses];
  const mode = getCameraFitMode();
  function noseScreenX(pose) {
    const n = pose.keypoints?.find((k) => k.name === "nose");
    if (!n) return Number.POSITIVE_INFINITY;
    return mapVideoKpToCanvas(n, viewWidthPx, viewHeightPx, vw, vh, true, mode).x;
  }
  return [...poses].sort((a, b) => noseScreenX(a) - noseScreenX(b));
}

export async function initPoseBackend() {
  const tf = window.tf;
  const poseDetection = window.poseDetection;

  if (!tf || !poseDetection) {
    throw new Error("TensorFlow.js ou pose-detection não encontrados no window.");
  }

  let webglOk = false;
  try {
    webglOk = await tf.setBackend("webgl");
  } catch {
    webglOk = false;
  }
  if (!webglOk) {
    await tf.setBackend("cpu");
  }
  await tf.ready();

  const mv = poseDetection.movenet;
  const multi =
    mv?.modelType?.MULTIPOSE_LIGHTNING ??
    mv?.modelType?.MULTIPOSE ??
    null;
  const single = mv?.modelType?.SINGLEPOSE_LIGHTNING;

  // O TensorFlow Hub redireciona para o Kaggle, que quebra por CORS em hosts estáticos
  // (GitHub Pages etc.). Tentamos carregar primeiro os arquivos do modelo hospedados no
  // próprio repositório (assets/models/...), mantendo o fetch na mesma origem. Se o
  // arquivo local não existir, caímos para o padrão do pose-detection.
  const localMultiPoseUrl = new URL(
    "../../assets/models/movenet/multipose-lightning/model.json",
    import.meta.url
  ).href;
  const localSinglePoseUrl = new URL(
    "../../assets/models/movenet/singlepose-lightning/model.json",
    import.meta.url
  ).href;

  async function exists(url) {
    try {
      const res = await fetch(url, { method: "HEAD", cache: "no-store" });
      return res.ok;
    } catch {
      return false;
    }
  }

  const hasLocalMulti = multi ? await exists(localMultiPoseUrl) : false;
  const hasLocalSingle = single ? await exists(localSinglePoseUrl) : false;

  if (multi) {
    try {
      detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        hasLocalMulti
          ? { modelType: multi, modelUrl: localMultiPoseUrl }
          : { modelType: multi }
      );
      return detector;
    } catch (err) {
      console.warn("Falha ao carregar MULTIPOSE, tentando SINGLEPOSE:", err);
    }
  }

  const singleConfig = single
    ? hasLocalSingle
      ? { modelType: single, modelUrl: localSinglePoseUrl }
      : { modelType: single }
    : hasLocalSingle
    ? { modelUrl: localSinglePoseUrl }
    : {};

  detector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    singleConfig
  );
  return detector;
}

/**
 * Inicia loop de inferência com throttle. WebGL executa kernels na GPU.
 * @param {HTMLVideoElement} video
 */
export function startInferenceLoop(video) {
  stopInferenceLoop();
  videoEl = video;

  const tick = (now) => {
    inferenceHandle = requestAnimationFrame(tick);

    if (!videoEl || videoEl.readyState < 2) return;
    if (inferring) return;
    if (now - lastInferenceTime < INFERENCE_INTERVAL_MS) return;

    inferring = true;
    lastInferenceTime = now;

    detector
      .estimatePoses(videoEl, { maxPoses: 2 })
      .then((poses) => {
        cachedPoses = poses || [];
      })
      .catch(() => {
        cachedPoses = [];
      })
      .finally(() => {
        inferring = false;
      });
  };

  inferenceHandle = requestAnimationFrame(tick);
}

export function stopInferenceLoop() {
  if (inferenceHandle) {
    cancelAnimationFrame(inferenceHandle);
    inferenceHandle = 0;
  }
  videoEl = null;
}

/** Primeira pose ordenada (P1) — compatibilidade */
export function getPrimaryPose() {
  const players = getPlayerPoses();
  return players[0] || null;
}

export function getCachedPoses() {
  return cachedPoses;
}

export function clearPoseCache() {
  cachedPoses = [];
}
