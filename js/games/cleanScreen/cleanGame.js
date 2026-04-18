import { getCachedPoses } from "../../core/poseService.js";
import { getCameraFitMode } from "../../core/cameraDisplayPrefs.js";
import { getVideoFitRect, getVideoLayoutRect } from "../../core/videoFit.js";
import { createCleanInputMapper } from "../../input/poseToCleanInput.js";

const GAME_DURATION_MS = 30_000;
const END_COUNTDOWN_MS = 5_000;
const MAX_DIRT_PER_OWNER = 3;
const DIRT_HP_MIN = 3;
const DIRT_HP_MAX = 5;
const POINTS_PER_CLEAN = 5;

const SPONGE_URL = new URL("../../../assets/minigame-clean/espong.png", import.meta.url).href;

/** @type {HTMLImageElement|null} */
let spongeImg = null;
(function preloadSponge() {
  const img = new Image();
  img.onload = () => {
    spongeImg = img;
  };
  img.src = SPONGE_URL;
})();

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickHp() {
  return randInt(DIRT_HP_MIN, DIRT_HP_MAX);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} r
 * @param {number} alpha
 */
function drawDirtBlob(ctx, x, y, r, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  // Marrom mais escuro.
  ctx.fillStyle = "rgba(32, 24, 16, 1)";

  // “Mancha” procedural: 3 camadas de círculos com offsets.
  const n = 10;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.55 + 0.25 * Math.sin(a * 2.1));
    const ox = Math.cos(a) * r * 0.35;
    const oy = Math.sin(a) * r * 0.28;
    ctx.beginPath();
    ctx.arc(x + ox, y + oy, rr, 0, Math.PI * 2);
    ctx.fill();
  }

  // brilho/sujeira extra
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillStyle = "rgba(0, 0, 0, 1)";
  ctx.beginPath();
  ctx.arc(x - r * 0.16, y - r * 0.12, r * 0.58, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function computeVideoContentRect(canvas, video) {
  const cw = canvas.width;
  const ch = canvas.height;
  if (!video || (video.readyState ?? 0) < 2 || (video.videoWidth ?? 0) < 2) {
    return { x: 0, y: 0, w: cw, h: ch };
  }
  return getVideoLayoutRect(cw, ch, video.videoWidth, video.videoHeight, getCameraFitMode());
}

function drawCameraBackground(ctx, canvas, video) {
  const cw = canvas.width;
  const ch = canvas.height;
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, cw, ch);
  if (!video || (video.readyState ?? 0) < 2) return;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw < 2 || vh < 2) return;

  const mode = getCameraFitMode();
  ctx.save();
  // selfie: espelho X
  ctx.translate(cw, 0);
  ctx.scale(-1, 1);
  if (mode === "cover") {
    const scale = Math.max(cw / vw, ch / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    ctx.drawImage(video, 0, 0, vw, vh, dx, dy, dw, dh);
  } else {
    const { dx, dy, dw, dh } = getVideoFitRect(cw, ch, vw, vh);
    ctx.drawImage(video, 0, 0, vw, vh, dx, dy, dw, dh);
  }
  ctx.restore();
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} [options]
 * @param {HTMLVideoElement} [options.video]
 * @param {"single"|"multi"} [options.mode]
 * @param {(result: {
 *   gameId: "cleanScreen";
 *   mode: "single"|"multi";
 *   timeSec: number;
 *   winner: null | 1 | 2;
 *   scoreP1: number;
 *   scoreP2: number;
 *   scoreTotal: number;
 * }) => void} [options.onFinish]
 * @param {(textEl: HTMLElement, opts?: { wrapEl?: HTMLElement }) => Promise<void>} [options.runEndCountdown]
 */
export function createCleanGame(canvas, options = {}) {
  const ctx = canvas.getContext("2d");
  const { video, mode = "multi", onFinish, runEndCountdown } = options;
  const single = mode === "single";
  const input = createCleanInputMapper();
  /** Enquanto true, não spawna nem desenha gameplay (aguarda 3-2-1). */
  let gameplayPaused = false;

  /** @type {{ id:string; x:number; y:number; r:number; hp:number; maxHp:number; spawnAt:number; owner:0|1 }[]} */
  let dirt = [];
  /** Estado por mão: qual mancha está “dentro” agora (precisa sair para limpar de novo). */
  const handInside = {
    p0l: null,
    p0r: null,
    p1l: null,
    p1r: null,
  };
  let dirtSeq = 0;
  let scores = [0, 0];
  let finished = false;
  let finishFired = false;
  let startMs = 0;
  let rafId = 0;
  let endCountdownStarted = false;
  const punch = {
    p0l: 0,
    p0r: 0,
    p1l: 0,
    p1r: 0,
  };
  const PUNCH_MS = 120;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function regionForOwner(vr, owner) {
    if (single) return { x: vr.x, y: vr.y, w: vr.w, h: vr.h };
    const mid = vr.x + vr.w / 2;
    const gap = Math.max(8, vr.w * 0.012);
    if (owner === 0) return { x: vr.x, y: vr.y, w: Math.max(48, mid - gap / 2 - vr.x), h: vr.h };
    const rx = mid + gap / 2;
    return { x: rx, y: vr.y, w: Math.max(48, vr.x + vr.w - rx), h: vr.h };
  }

  function dirtRadiusPx(vr) {
    const base = Math.min(vr.w, vr.h);
    return Math.max(34, Math.min(62, base * 0.09));
  }

  function spawnOne(owner, now) {
    const vr = computeVideoContentRect(canvas, video);
    const reg = regionForOwner(vr, owner);
    // Até +50% maior.
    const r = dirtRadiusPx(vr) * (1 + Math.random() * 0.5);
    const pad = Math.max(18, r * 0.8);
    const minX = reg.x + pad;
    const maxX = reg.x + reg.w - pad;
    const minY = reg.y + pad + Math.min(90, reg.h * 0.12);
    const maxY = reg.y + reg.h - pad;

    // tenta posições para evitar sobreposição forte com manchas existentes do mesmo owner
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const x = minX + Math.random() * Math.max(1, maxX - minX);
      const y = minY + Math.random() * Math.max(1, maxY - minY);
      const ok = dirt
        .filter((d) => d.owner === owner)
        .every((d) => Math.hypot(d.x - x, d.y - y) > (d.r + r) * 0.85);
      if (!ok) continue;
      const hp = pickHp();
      dirtSeq += 1;
      dirt.push({ id: `d${owner}-${dirtSeq}`, x, y, r, hp, maxHp: hp, spawnAt: now, owner });
      return;
    }

    // fallback
    const hp = pickHp();
    dirtSeq += 1;
    dirt.push({
      id: `d${owner}-${dirtSeq}`,
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      r,
      hp,
      maxHp: hp,
      spawnAt: now,
      owner,
    });
  }

  function ensureDirt(now) {
    const owners = single ? [0] : [0, 1];
    for (const owner of owners) {
      const count = dirt.filter((d) => d.owner === owner).length;
      for (let i = count; i < MAX_DIRT_PER_OWNER; i += 1) spawnOne(owner, now);
    }
  }

  function hpAlpha(d) {
    const r = d.maxHp > 0 ? d.hp / d.maxHp : 0;
    // Mantém um mínimo para “ver” a mancha até a última vida.
    return 0.18 + 0.82 * clamp01(r);
  }

  function spawnAlpha(now, d) {
    const ms = 420;
    return clamp01((now - d.spawnAt) / ms);
  }

  function findDirtUnderPoint(owner, x, y) {
    const candidates = dirt.filter((d) => d.owner === owner && d.hp > 0);
    if (!candidates.length) return null;

    let best = null;
    let bestDist = Infinity;
    for (const d of candidates) {
      const dist = Math.hypot(d.x - x, d.y - y);
      if (dist <= d.r * 1.05 && dist < bestDist) {
        best = d;
        bestDist = dist;
      }
    }
    return best;
  }

  function cleanOnce(d, owner, now, handKey) {
    d.hp -= 1;
    if (owner === 0) scores[0] += POINTS_PER_CLEAN;
    else scores[1] += POINTS_PER_CLEAN;
    if (handKey && typeof punch[handKey] === "number") {
      punch[handKey] = now + PUNCH_MS;
    }

    if (d.hp <= 0) {
      dirt = dirt.filter((x) => x !== d);
      // Reposição imediata com fade.
      ensureDirt(now);
    }
  }

  function drawSplitGuide(vr) {
    if (single) return;
    const mid = vr.x + vr.w / 2;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(mid, vr.y + 8);
    ctx.lineTo(mid, vr.y + vr.h - 8);
    ctx.stroke();
    ctx.restore();
  }

  function punchScale(nowMs, handKey) {
    const until = punch[handKey] ?? 0;
    if (!until || nowMs >= until) return 1;
    const t = 1 - (until - nowMs) / PUNCH_MS; // 0..1
    // up-down rápido (triangular).
    const p = t < 0.5 ? t / 0.5 : (1 - t) / 0.5;
    return 1 + 0.16 * Math.max(0, Math.min(1, p));
  }

  function drawSpongeAt(x, y, vr, nowMs, handKey) {
    const img = spongeImg;
    if (!img || !img.complete || img.naturalWidth < 2) return;
    const base = Math.min(vr.w, vr.h);
    const w = Math.max(44, Math.min(110, base * 0.12));
    const ar = img.naturalHeight / img.naturalWidth;
    const h = w * ar;
    // âncora um pouco acima do punho, pra parecer “na mão”
    const ay = 0.58;
    const s = punchScale(nowMs, handKey);
    ctx.save();
    ctx.translate(x, y - h * ay);
    ctx.scale(s, s);
    ctx.drawImage(img, -w / 2, 0, w, h);
    ctx.restore();
  }

  function drawHandsAndSponges(mapped, vr, nowMs) {
    const owners = single ? [0] : [0, 1];
    for (const owner of owners) {
      const p = mapped.players[owner];
      for (const side of ["left", "right"]) {
        const h = p?.hands?.[side];
        if (!h?.visible) continue;
        const handKey =
          owner === 0
            ? side === "left"
              ? "p0l"
              : "p0r"
            : side === "left"
              ? "p1l"
              : "p1r";
        ctx.save();
        ctx.globalAlpha = 0.98;
        drawSpongeAt(h.x, h.y, vr, nowMs, handKey);
        ctx.restore();
      }
    }
  }

  function drawDirt(now) {
    for (const d of dirt) {
      if (d.hp <= 0) continue;
      const a = spawnAlpha(now, d) * hpAlpha(d);
      drawDirtBlob(ctx, d.x, d.y, d.r, a);
    }
  }

  function fillScorePanel(x, y, w, h, radius) {
    ctx.fillStyle = "rgba(15, 23, 42, 0.86)";
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, radius);
    else ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawScore(vr) {
    const centerY = vr.y + Math.max(22, Math.min(46, vr.h * 0.072));
    const mainPx = Math.round(Math.min(42, Math.max(22, vr.w * 0.052)));
    const padX = 18;
    const padY = 12;
    const radius = 14;

    ctx.save();
    ctx.textBaseline = "middle";
    ctx.font = `800 ${mainPx}px system-ui,sans-serif`;

    if (single) {
      const label = `${scores[0]} pts`;
      const tw = ctx.measureText(label).width;
      const bw = tw + padX * 2;
      const bh = mainPx + padY * 2;
      const cx = vr.x + vr.w / 2;
      const bx = cx - bw / 2;
      const by = centerY - bh / 2;
      fillScorePanel(bx, by, bw, bh, radius);
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(248, 250, 252, 0.96)";
      ctx.fillText(label, cx, centerY);
    } else {
      const t1 = `P1  ${scores[0]}`;
      const t2 = `${scores[1]}  P2`;
      const w1 = ctx.measureText(t1).width + padX * 2;
      const w2 = ctx.measureText(t2).width + padX * 2;
      const bh = mainPx + padY * 2;
      const by = centerY - bh / 2;
      const mid = vr.x + vr.w / 2;
      const cxLeft = (vr.x + mid) / 2;
      const cxRight = (mid + vr.x + vr.w) / 2;
      const bx1 = Math.max(vr.x + 8, cxLeft - w1 / 2);
      const bx2 = Math.min(vr.x + vr.w - w2 - 8, cxRight - w2 / 2);

      fillScorePanel(bx1, by, w1, bh, radius);
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(52, 211, 153, 0.98)";
      ctx.fillText(t1, bx1 + padX, centerY);

      fillScorePanel(bx2, by, w2, bh, radius);
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(251, 146, 60, 0.98)";
      ctx.fillText(t2, bx2 + w2 - padX, centerY);
    }

    ctx.restore();
  }

  function finish(elapsedMs) {
    finished = true;
    // Ao terminar, removemos elementos de gameplay do canvas (manchas/esponjas).
    dirt = [];
    handInside.p0l = null;
    handInside.p0r = null;
    handInside.p1l = null;
    handInside.p1r = null;
    if (!onFinish) return;
    if (finishFired) return;
    finishFired = true;
    const timeSec = elapsedMs / 1000;
    const s1 = scores[0];
    const s2 = scores[1];
    let winner = null;
    if (!single) {
      if (s1 > s2) winner = 1;
      else if (s2 > s1) winner = 2;
    }
    onFinish({
      gameId: "cleanScreen",
      mode: single ? "single" : "multi",
      timeSec,
      winner,
      scoreP1: s1,
      scoreP2: single ? 0 : s2,
      scoreTotal: s1 + (single ? 0 : s2),
    });
  }

  function gameLoop(t) {
    if (!gameplayPaused && !startMs) startMs = t;
    if (gameplayPaused) {
      drawCameraBackground(ctx, canvas, video);
      const vr = computeVideoContentRect(canvas, video);
      drawSplitGuide(vr);
      rafId = requestAnimationFrame(gameLoop);
      return;
    }
    const elapsedMs = t - startMs;
    const remainingMs = Math.max(0, GAME_DURATION_MS - elapsedMs);

    // contagem final 5..1
    if (!endCountdownStarted && runEndCountdown && remainingMs <= END_COUNTDOWN_MS) {
      endCountdownStarted = true;
      const textEl = document.getElementById("overlay-countdown");
      const wrapEl = document.getElementById("overlay-countdown-wrap");
      if (textEl) {
        void runEndCountdown(textEl, { wrapEl: wrapEl ?? undefined }).catch(() => {});
      }
    }

    if (!finished) ensureDirt(t);

    drawCameraBackground(ctx, canvas, video);
    const vr = computeVideoContentRect(canvas, video);
    drawSplitGuide(vr);

    const poses = getCachedPoses();
    const mapped = input.map({
      poses,
      video,
      canvas,
      mode: single ? "single" : "multi",
      nowMs: t,
    });

    if (!finished) {
      // Limpeza por “entrada na mancha”: limpa 1x ao entrar, só limpa de novo após sair.
      const ownersCount = single ? 1 : 2;
      for (let owner = 0; owner < ownersCount; owner += 1) {
        const p = mapped.players[owner];
        for (const side of ["left", "right"]) {
          const h = p?.hands?.[side];
          const key =
            owner === 0
              ? side === "left"
                ? "p0l"
                : "p0r"
              : side === "left"
                ? "p1l"
                : "p1r";

          if (!h?.visible) {
            handInside[key] = null;
            continue;
          }

          const under = findDirtUnderPoint(owner, h.x, h.y);
          const underId = under?.id ?? null;
          const prevId = handInside[key];

          if (underId === null) {
            handInside[key] = null;
            continue;
          }

          // Entrou agora (antes estava fora ou em outra mancha) → limpa 1 vez.
          if (prevId !== underId && under) {
            cleanOnce(under, owner, t, key);
            handInside[key] = underId;
          }
        }
      }
    }

    if (!finished) {
      drawDirt(t);
      drawHandsAndSponges(mapped, vr, t);
    }
    drawScore(vr);

    if (elapsedMs >= GAME_DURATION_MS) {
      finish(elapsedMs);
    }

    rafId = requestAnimationFrame(gameLoop);
  }

  return {
    /** @param {{ startPaused?: boolean }} [opts] */
    start(opts = {}) {
      gameplayPaused = opts.startPaused === true;
      finished = false;
      finishFired = false;
      startMs = 0;
      endCountdownStarted = false;
      scores = [0, 0];
      dirt = [];
      input.reset();
      handInside.p0l = null;
      handInside.p0r = null;
      handInside.p1l = null;
      handInside.p1r = null;
      punch.p0l = 0;
      punch.p0r = 0;
      punch.p1l = 0;
      punch.p1r = 0;
      dirtSeq = 0;
      resize();
      if (!gameplayPaused) ensureDirt(performance.now());
      window.addEventListener("resize", resize);
      rafId = requestAnimationFrame(gameLoop);
    },
    resumeGameplay() {
      gameplayPaused = false;
    },
    stop() {
      finished = true;
      cancelAnimationFrame(rafId);
      rafId = 0;
      window.removeEventListener("resize", resize);
    },
  };
}

