/**
 * Detector simples de “círculo completo” baseado em soma de ângulos.
 * Mantém histórico curto e dispara um evento quando o trajeto dá ~1 volta.
 *
 * Esta camada NÃO sabe nada sobre o jogo (apenas gesto → evento).
 */

/**
 * @typedef {{ x: number; y: number; t: number }} Pt
 */

const DEFAULTS = {
  maxPoints: 34,
  /** Ignora amostras muito antigas (ms). */
  maxAgeMs: 950,
  /** Evita “teleporte”/saltos bruscos (px). */
  maxJumpPx: 140,
  /** Raio mínimo (px) para considerar círculo. */
  minRadiusPx: 16,
  /** Caminho mínimo (px) para evitar tremidinhas. */
  minPathPx: 180,
  /** Variação relativa do raio (desvio / média) máxima. */
  maxRadiusCv: 0.42,
  /** Quanto de volta precisa (2π = 1 volta). */
  targetTurns: 1.0,
  /** Cooldown após disparo (ms). */
  cooldownMs: 380,
};

function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) * (x - m), 0) / (arr.length - 1);
  return Math.sqrt(v);
}

function pathLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

function centroid(points) {
  if (!points.length) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

/**
 * @param {Partial<typeof DEFAULTS>} [opts]
 */
export function createCircleGestureDetector(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  /** @type {Pt[]} */
  let pts = [];
  let lastFireMs = 0;
  let lastAngle = 0;
  let angleSum = 0;

  function reset() {
    pts = [];
    lastAngle = 0;
    angleSum = 0;
  }

  /**
   * @param {{ x: number; y: number; t: number }} sample
   * @returns {{ circleComplete: boolean; turns: number }}
   */
  function push(sample) {
    const now = sample.t;
    if (lastFireMs && now - lastFireMs < cfg.cooldownMs) {
      // Ainda coletamos pontos para “sentir” continuidade, mas com reset suave.
      reset();
    }

    if (pts.length) {
      const prev = pts[pts.length - 1];
      if (now - prev.t > cfg.maxAgeMs) {
        reset();
      } else if (Math.hypot(sample.x - prev.x, sample.y - prev.y) > cfg.maxJumpPx) {
        reset();
      }
    }

    pts.push(sample);
    if (pts.length > cfg.maxPoints) pts.shift();

    // Remove pontos muito antigos.
    const cutoff = now - cfg.maxAgeMs;
    while (pts.length > 3 && pts[0].t < cutoff) pts.shift();

    if (pts.length < 10) return { circleComplete: false, turns: 0 };

    const c = centroid(pts);
    const radii = pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y));
    const rMean = mean(radii);
    const rStd = stddev(radii);
    const rCv = rMean > 0.0001 ? rStd / rMean : 99;
    const path = pathLength(pts);

    if (rMean < cfg.minRadiusPx || rCv > cfg.maxRadiusCv || path < cfg.minPathPx) {
      // Se não parece círculo, não acumula volta; mantém histórico.
      angleSum *= 0.92;
      return { circleComplete: false, turns: angleSum / (Math.PI * 2) };
    }

    const last = pts[pts.length - 1];
    const ang = Math.atan2(last.y - c.y, last.x - c.x);
    if (pts.length === 10) {
      lastAngle = ang;
      return { circleComplete: false, turns: 0 };
    }
    const d = normAngle(ang - lastAngle);
    lastAngle = ang;
    angleSum += d;

    const turns = angleSum / (Math.PI * 2);
    const circleComplete = Math.abs(turns) >= cfg.targetTurns;
    if (circleComplete) {
      lastFireMs = now;
      reset();
      return { circleComplete: true, turns: 0 };
    }

    return { circleComplete: false, turns };
  }

  return {
    reset,
    push,
  };
}

