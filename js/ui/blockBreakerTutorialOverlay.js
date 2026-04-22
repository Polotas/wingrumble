const IMG_1_URL = new URL("../../assets/minigame-break/tutorial/tutorial-break-1.png", import.meta.url)
  .href;
const IMG_2_URL = new URL("../../assets/minigame-break/tutorial/tutorial-break-2.png", import.meta.url)
  .href;

function clampInt(n, min, max) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Tutorial do BlockBreaker (overlay com dim) — alterna imagens 1↔2 e mostra timer.
 * @param {{
 *   wrapEl: HTMLElement;
 *   imgEl: HTMLImageElement;
 *   textEl?: HTMLElement;
 *   timerEl: HTMLElement;
 *   durationMs?: number;
 *   swapMs?: number;
 * }} args
 */
export async function runBlockBreakerTutorialOverlay(args) {
  const {
    wrapEl,
    imgEl,
    textEl,
    timerEl,
    durationMs = 5000,
    swapMs = 1000,
  } = args || {};

  if (!wrapEl || !imgEl || !timerEl) return;

  const totalMs = Math.max(0, Number(durationMs) || 0);
  const swapEveryMs = Math.max(250, Number(swapMs) || 1000);
  const totalSec = clampInt(Math.ceil(totalMs / 1000), 1, 9);

  let swapTid = 0;
  let countdownTid = 0;

  const cleanup = () => {
    if (swapTid) window.clearInterval(swapTid);
    if (countdownTid) window.clearInterval(countdownTid);
    swapTid = 0;
    countdownTid = 0;
    wrapEl.classList.remove("overlay-bb-tutorial-wrap--visible");
    wrapEl.setAttribute("aria-hidden", "true");
  };

  try {
    wrapEl.setAttribute("aria-hidden", "false");
    wrapEl.classList.add("overlay-bb-tutorial-wrap--visible");

    // Pré-carrega as imagens para o swap ser imediato.
    try {
      const p1 = new Image();
      const p2 = new Image();
      p1.decoding = "async";
      p2.decoding = "async";
      p1.src = IMG_1_URL;
      p2.src = IMG_2_URL;
    } catch {
      /* ignore */
    }

    imgEl.src = IMG_1_URL;
    let toggle = false;
    swapTid = window.setInterval(() => {
      toggle = !toggle;
      imgEl.src = toggle ? IMG_2_URL : IMG_1_URL;
    }, swapEveryMs);

    let remaining = totalSec;
    timerEl.textContent = String(remaining);
    countdownTid = window.setInterval(() => {
      remaining = Math.max(0, remaining - 1);
      timerEl.textContent = String(Math.max(1, remaining));
    }, 1000);

    await sleep(totalMs);
  } finally {
    cleanup();
  }
}

