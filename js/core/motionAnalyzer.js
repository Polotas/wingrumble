/**
 * Analisa sequência de poses para estimar corrida no lugar vs parado.
 * Usa oscilação temporal de joelhos/tornozelos normalizada pelo torso.
 */

const BUFFER_MAX = 22;
const KP_MIN = 0.22;

const RUN_THRESHOLD = 0.042;
const RUN_SATURATE = 0.17;
const SMOOTH = 0.22;

function findKp(keypoints, name) {
  return keypoints.find((k) => k.name === name);
}

function stdDev(values) {
  if (values.length < 3) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function extractFrameMetrics(pose) {
  if (!pose || !Array.isArray(pose.keypoints)) return null;

  const kp = pose.keypoints;
  const lk = findKp(kp, "left_knee");
  const rk = findKp(kp, "right_knee");
  const la = findKp(kp, "left_ankle");
  const ra = findKp(kp, "right_ankle");
  const lh = findKp(kp, "left_hip");
  const rh = findKp(kp, "right_hip");
  const ls = findKp(kp, "left_shoulder");
  const rs = findKp(kp, "right_shoulder");
  const lw = findKp(kp, "left_wrist");
  const rw = findKp(kp, "right_wrist");

  if (
    !lk ||
    !rk ||
    !lh ||
    !rh ||
    !ls ||
    !rs ||
    lk.score < KP_MIN ||
    rk.score < KP_MIN ||
    lh.score < KP_MIN ||
    rh.score < KP_MIN ||
    ls.score < KP_MIN ||
    rs.score < KP_MIN
  ) {
    return null;
  }

  const hipY = (lh.y + rh.y) / 2;
  const shoulderY = (ls.y + rs.y) / 2;
  const torso = Math.abs(shoulderY - hipY) || 120;
  const normKnee = (lk.y - rk.y) / torso;
  let normAnkle = 0;
  if (la && ra && la.score >= KP_MIN && ra.score >= KP_MIN) {
    normAnkle = (la.y - ra.y) / torso;
  }
  let normWrist = 0;
  if (lw && rw && lw.score >= KP_MIN && rw.score >= KP_MIN) {
    normWrist = (lw.y - rw.y) / torso;
  }

  return { normKnee, normAnkle, normWrist };
}

export function createMotionAnalyzer() {
  const buffer = [];
  let smoothedIntensity = 0;

  function reset() {
    buffer.length = 0;
    smoothedIntensity = 0;
  }

  function pushPose(pose) {
    const m = extractFrameMetrics(pose);
    if (!m) return;

    buffer.push(m);
    if (buffer.length > BUFFER_MAX) buffer.shift();
  }

  function rawRunningSignal() {
    if (buffer.length < 6) return 0;

    const knees = buffer.map((b) => b.normKnee);
    const ankles = buffer.map((b) => b.normAnkle);
    const wrists = buffer.map((b) => b.normWrist);

    const sK = stdDev(knees);
    const sA = stdDev(ankles);
    const sW = stdDev(wrists);

    return sK + 0.55 * sA + 0.25 * sW;
  }

  function getRunningState() {
    const raw = rawRunningSignal();

    let target = 0;
    if (raw > RUN_THRESHOLD) {
      if (raw >= RUN_SATURATE) {
        target = 1;
      } else {
        target = (raw - RUN_THRESHOLD) / (RUN_SATURATE - RUN_THRESHOLD);
      }
    }

    smoothedIntensity += (target - smoothedIntensity) * SMOOTH;

    if (raw <= RUN_THRESHOLD) {
      smoothedIntensity *= 0.5;
    }

    const intensityOut =
      raw > RUN_THRESHOLD ? Math.min(1, Math.max(0, smoothedIntensity)) : 0;

    const isRunning =
      intensityOut > 0.12 && raw > RUN_THRESHOLD * 0.9;

    return {
      intensity: intensityOut,
      isRunning,
      raw,
    };
  }

  return { pushPose, getRunningState, reset };
}
