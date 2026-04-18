import { getCachedPoses } from "../../core/poseService.js";
import { getCameraFitMode } from "../../core/cameraDisplayPrefs.js";
import { getVideoFitRect, getVideoLayoutRect } from "../../core/videoFit.js";
import { createCollectInputMapper } from "../../input/poseToCollectInput.js";

const GAME_DURATION_MS = 30_000;
const END_COUNTDOWN_MS = 5_000;

const POINTS = {
  apple: 5,
  mango: 10,
  watermellon: 30,
  bomb: -20,
};

const SPRITES = {
  apple: new URL("../../../assets/minigame-collect/apple.png", import.meta.url).href,
  mango: new URL("../../../assets/minigame-collect/mango.png", import.meta.url).href,
  watermellon: new URL("../../../assets/minigame-collect/watermellon.png", import.meta.url).href,
  bomb: new URL("../../../assets/minigame-collect/bomb.png", import.meta.url).href,
  basket: new URL("../../../assets/minigame-collect/basket.png", import.meta.url).href,
};

/** @type {Record<string, HTMLImageElement|null>} */
const imgs = {
  apple: null,
  mango: null,
  watermellon: null,
  bomb: null,
  basket: null,
};

(function preload() {
  /** @param {keyof typeof imgs} key */
  function load(key) {
    const img = new Image();
    img.onload = () => {
      imgs[key] = img;
    };
    img.src = SPRITES[key];
  }
  load("apple");
  load("mango");
  load("watermellon");
  load("bomb");
  load("basket");
})();

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
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

function fillScorePanel(ctx, x, y, w, h, radius) {
  ctx.fillStyle = "rgba(15, 23, 42, 0.86)";
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, radius);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawScore(ctx, vr, scores, single) {
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
    fillScorePanel(ctx, bx, by, bw, bh, radius);
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

    fillScorePanel(ctx, bx1, by, w1, bh, radius);
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(52, 211, 153, 0.98)";
    ctx.fillText(t1, bx1 + padX, centerY);

    fillScorePanel(ctx, bx2, by, w2, bh, radius);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(251, 146, 60, 0.98)";
    ctx.fillText(t2, bx2 + w2 - padX, centerY);
  }

  ctx.restore();
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function regionForOwner(vr, single, owner) {
  if (single) return { x: vr.x, y: vr.y, w: vr.w, h: vr.h };
  const mid = vr.x + vr.w / 2;
  const gap = Math.max(8, vr.w * 0.012);
  if (owner === 0) return { x: vr.x, y: vr.y, w: Math.max(48, mid - gap / 2 - vr.x), h: vr.h };
  const rx = mid + gap / 2;
  return { x: rx, y: vr.y, w: Math.max(48, vr.x + vr.w - rx), h: vr.h };
}

function pickType() {
  // pesos simples: maçã/manga comuns; melancia rara; bomba ocasional
  const r = Math.random();
  if (r < 0.46) return "apple";
  if (r < 0.78) return "mango";
  if (r < 0.90) return "bomb";
  return "watermellon";
}

function circleRectOverlap(cx, cy, cr, rx, ry, rw, rh) {
  const px = Math.max(rx, Math.min(cx, rx + rw));
  const py = Math.max(ry, Math.min(cy, ry + rh));
  return (cx - px) ** 2 + (cy - py) ** 2 <= cr ** 2;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} [options]
 * @param {HTMLVideoElement} [options.video]
 * @param {"single"|"multi"} [options.mode]
 * @param {(result: {
 *   gameId: "collect";
 *   mode: "single"|"multi";
 *   timeSec: number;
 *   winner: null | 1 | 2;
 *   scoreP1: number;
 *   scoreP2: number;
 *   scoreTotal: number;
 * }) => void} [options.onFinish]
 * @param {(textEl: HTMLElement, opts?: { wrapEl?: HTMLElement; dim?: boolean }) => Promise<void>} [options.runEndCountdown]
 */
export function createCollectGame(canvas, options = {}) {
  const ctx = canvas.getContext("2d");
  const { video, mode = "multi", onFinish, runEndCountdown } = options;
  const single = mode === "single";
  const input = createCollectInputMapper();

  /** @type {{ id: string; type: "apple"|"mango"|"watermellon"|"bomb"; x:number; y:number; vx:number; vy:number; r:number; owner:0|1 }[]} */
  let items = [];
  let seq = 0;
  let scores = [0, 0];
  let startMs = 0;
  let rafId = 0;
  let finished = false;
  let finishFired = false;
  let endCountdownStarted = false;
  /** Enquanto true, desenha mas não avança tempo/spawn/física (3-2-1). */
  let gameplayPaused = false;
  const spawnNextAt = [0, 0];
  const basketPunchUntil = [0, 0];
  const BASKET_PUNCH_MS = 140;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function spawn(owner, now) {
    const vr = computeVideoContentRect(canvas, video);
    const reg = regionForOwner(vr, single, owner);
    const top = reg.y + Math.max(10, reg.h * 0.03);
    const base = Math.min(reg.w, reg.h);
    const r = Math.max(18, Math.min(44, base * 0.06));
    const type = /** @type {any} */ (pickType());
    const padX = Math.max(r * 1.35, Math.min(36, reg.w * 0.08));
    const x = reg.x + padX + Math.random() * Math.max(1, reg.w - padX * 2);
    seq += 1;
    items.push({
      id: `i${owner}-${seq}`,
      type,
      x,
      y: top - r * 1.2,
      vx: (Math.random() - 0.5) * Math.min(90, reg.w * 0.08),
      vy: 0,
      r,
      owner,
    });

    const cd = 450 + Math.random() * 450;
    spawnNextAt[owner] = now + cd;
  }

  function ensureSpawns(now) {
    const owners = single ? [0] : [0, 1];
    for (const owner of owners) {
      if (!spawnNextAt[owner]) spawnNextAt[owner] = now + 300;
      if (now >= spawnNextAt[owner]) spawn(owner, now);
    }
  }

  function drawSplitGuide(vr) {
    if (single) return;
    const mid = vr.x + vr.w / 2;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(mid, vr.y + 8);
    ctx.lineTo(mid, vr.y + vr.h - 8);
    ctx.stroke();
    ctx.restore();
  }

  function drawBasket(basket, nowMs, owner) {
    if (!basket?.visible) return;
    const img = imgs.basket;
    if (!img || !img.complete || img.naturalWidth < 2) return;

    const w = basket.w;
    const h = basket.h;
    // Respiração + punch ao coletar.
    const pulse = 1 + 0.03 * Math.sin(nowMs * 0.012 + owner * 2.1);
    const until = basketPunchUntil[owner] ?? 0;
    let punch = 1;
    if (until && nowMs < until) {
      const t = 1 - (until - nowMs) / BASKET_PUNCH_MS; // 0..1
      const tri = t < 0.5 ? t / 0.5 : (1 - t) / 0.5;
      punch = 1 + 0.18 * Math.max(0, Math.min(1, tri));
    }

    ctx.save();
    ctx.globalAlpha = 0.98;
    ctx.translate(basket.x, basket.y);
    ctx.scale(pulse * punch, pulse * punch);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawItems(vr) {
    for (const it of items) {
      const img = imgs[it.type];
      if (img && img.complete && img.naturalWidth > 0) {
        const s = (it.r * 2) / Math.max(1, img.naturalWidth);
        const w = img.naturalWidth * s;
        const h = img.naturalHeight * s;
        ctx.drawImage(img, it.x - w / 2, it.y - h / 2, w, h);
      } else {
        ctx.fillStyle = it.type === "bomb" ? "rgba(239,68,68,0.95)" : "rgba(250,204,21,0.95)";
        ctx.beginPath();
        ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // leve sombra
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.beginPath();
      ctx.ellipse(it.x, it.y + it.r * 1.05, it.r * 0.85, it.r * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function stepPhysics(dt, vr, elapsedMs) {
    const t = clamp01(elapsedMs / GAME_DURATION_MS);
    // Começa 50% mais lento e chega em 100% no final (mesma gravidade atual).
    const g = 1650 * lerp(0.5, 1, t);
    for (const it of items) {
      it.vy += g * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
    }

    // remove fora da tela/fora do retângulo do vídeo
    items = items.filter((it) => it.y - it.r < vr.y + vr.h + 80);
  }

  function applyCollisions(mapped) {
    const ownersCount = single ? 1 : 2;
    /** @type {Set<string>} */
    const toRemove = new Set();
    const scored = [false, false];

    for (let owner = 0; owner < ownersCount; owner += 1) {
      const basket = mapped.players[owner]?.basket;
      if (!basket?.visible) continue;
      const rx = basket.x - basket.w / 2;
      const ry = basket.y - basket.h / 2;
      const rw = basket.w;
      const rh = basket.h;

      for (const it of items) {
        if (it.owner !== owner) continue;
        if (circleRectOverlap(it.x, it.y, it.r, rx, ry, rw, rh)) {
          const delta = POINTS[it.type] ?? 0;
          scores[owner] += delta;
          toRemove.add(it.id);
          scored[owner] = true;
        }
      }
    }

    if (toRemove.size) {
      items = items.filter((it) => !toRemove.has(it.id));
    }

    if (scored[0]) basketPunchUntil[0] = performance.now() + BASKET_PUNCH_MS;
    if (scored[1]) basketPunchUntil[1] = performance.now() + BASKET_PUNCH_MS;
  }

  function finish(elapsedMs) {
    finished = true;
    // remove gameplay do canvas (fica só câmera/pontos enquanto a vitória roda)
    items = [];
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
      gameId: "collect",
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
    const elapsedMs = startMs ? t - startMs : 0;
    const remainingMs = Math.max(0, GAME_DURATION_MS - elapsedMs);

    if (!endCountdownStarted && runEndCountdown && remainingMs <= END_COUNTDOWN_MS) {
      endCountdownStarted = true;
      const textEl = document.getElementById("overlay-countdown");
      const wrapEl = document.getElementById("overlay-countdown-wrap");
      if (textEl) {
        // sem dim no final, conforme pedido
        void runEndCountdown(textEl, { wrapEl: wrapEl ?? undefined, dim: false }).catch(() => {});
      }
    }

    resize();
    const vr = computeVideoContentRect(canvas, video);

    if (!finished && !gameplayPaused) ensureSpawns(t);

    drawCameraBackground(ctx, canvas, video);
    drawSplitGuide(vr);

    const mapped = input.map({
      poses: getCachedPoses(),
      video,
      canvas,
      mode: single ? "single" : "multi",
      nowMs: t,
    });

    // desenha cestos sempre (mesmo no pause) para o jogador ver o estado.
    const ownersCount = single ? 1 : 2;
    for (let owner = 0; owner < ownersCount; owner += 1) {
      drawBasket(mapped.players[owner]?.basket, t, owner);
    }

    if (!finished && !gameplayPaused) {
      const dt = 1 / 60;
      stepPhysics(dt, vr, elapsedMs);
      applyCollisions(mapped);
      drawItems(vr);
    }

    drawScore(ctx, vr, scores, single);

    if (!gameplayPaused && elapsedMs >= GAME_DURATION_MS) {
      finish(elapsedMs);
    }

    rafId = requestAnimationFrame(gameLoop);
  }

  return {
    /** @param {{ startPaused?: boolean }} [opts] */
    start(opts = {}) {
      finished = false;
      finishFired = false;
      endCountdownStarted = false;
      startMs = 0;
      seq = 0;
      scores = [0, 0];
      items = [];
      spawnNextAt[0] = 0;
      spawnNextAt[1] = 0;
      basketPunchUntil[0] = 0;
      basketPunchUntil[1] = 0;
      gameplayPaused = opts.startPaused === true;
      input.reset();
      resize();
      window.addEventListener("resize", resize);
      rafId = requestAnimationFrame(gameLoop);
    },
    resumeGameplay() {
      gameplayPaused = false;
      // reinicia o “relógio” do jogo quando sai do pause
      startMs = 0;
      endCountdownStarted = false;
      spawnNextAt[0] = 0;
      spawnNextAt[1] = 0;
    },
    stop() {
      finished = true;
      cancelAnimationFrame(rafId);
      rafId = 0;
      window.removeEventListener("resize", resize);
    },
  };
}

