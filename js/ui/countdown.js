let sharedAudioCtx = null;

function getAudioContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!sharedAudioCtx) sharedAudioCtx = new AC();
  return sharedAudioCtx;
}

/**
 * Contagem 3, 2, 1, GO com bips (Web Audio API).
 * @param {HTMLElement} textEl elemento onde aparece 3, 2, 1, GO
 * @param {{ wrapEl?: HTMLElement }} [opts] — se `wrapEl` existir, mostra/oculta o wrapper (ex.: painel escuro + texto)
 * @returns {Promise<void>}
 */
export function runStartCountdown(textEl, opts = {}) {
  const wrapEl =
    opts.wrapEl ??
    (typeof textEl?.closest === "function"
      ? textEl.closest("[data-countdown-wrap]")
      : null) ??
    textEl;

  const steps = [
    { text: "3", freq: 523.25, ms: 780 },
    { text: "2", freq: 523.25, ms: 780 },
    { text: "1", freq: 523.25, ms: 780 },
    { text: "GO!", freq: 880, ms: 520 },
  ];

  async function beep(freq, dur = 0.09) {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") await ctx.resume();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime;
      g.gain.setValueAtTime(0.14, t0);
      g.gain.exponentialRampToValueAtTime(0.01, t0 + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur);
    } catch {
      /* ignore */
    }
  }

  return new Promise((resolve) => {
    wrapEl.classList.add("overlay-countdown-wrap--visible");
    wrapEl.setAttribute("aria-hidden", "false");
    let i = 0;

    function step() {
      if (i >= steps.length) {
        textEl.textContent = "";
        wrapEl.classList.remove("overlay-countdown-wrap--visible");
        wrapEl.setAttribute("aria-hidden", "true");
        resolve();
        return;
      }
      const { text, freq, ms } = steps[i];
      textEl.textContent = text;
      void beep(freq, i === steps.length - 1 ? 0.14 : 0.085);
      i += 1;
      setTimeout(step, ms);
    }

    step();
  });
}

/**
 * Contagem final 5, 4, 3, 2, 1 com bips (Web Audio API).
 * @param {HTMLElement} textEl elemento onde aparece 5..1
 * @param {{ wrapEl?: HTMLElement; dim?: boolean }} [opts]
 * @returns {Promise<void>}
 */
export function runEndCountdown(textEl, opts = {}) {
  const wrapEl =
    opts.wrapEl ??
    (typeof textEl?.closest === "function"
      ? textEl.closest("[data-countdown-wrap]")
      : null) ??
    textEl;
  const dim = opts.dim !== false;

  const steps = [
    { text: "5", freq: 523.25, ms: 780 },
    { text: "4", freq: 523.25, ms: 780 },
    { text: "3", freq: 523.25, ms: 780 },
    { text: "2", freq: 523.25, ms: 780 },
    { text: "1", freq: 523.25, ms: 780 },
  ];

  async function beep(freq, dur = 0.09) {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") await ctx.resume();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime;
      g.gain.setValueAtTime(0.14, t0);
      g.gain.exponentialRampToValueAtTime(0.01, t0 + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur);
    } catch {
      /* ignore */
    }
  }

  return new Promise((resolve) => {
    wrapEl.classList.add("overlay-countdown-wrap--visible");
    if (!dim) wrapEl.classList.add("overlay-countdown-wrap--no-dim");
    wrapEl.setAttribute("aria-hidden", "false");
    let i = 0;

    function step() {
      if (i >= steps.length) {
        textEl.textContent = "";
        wrapEl.classList.remove("overlay-countdown-wrap--visible");
        wrapEl.classList.remove("overlay-countdown-wrap--no-dim");
        wrapEl.setAttribute("aria-hidden", "true");
        resolve();
        return;
      }
      const { text, freq, ms } = steps[i];
      textEl.textContent = text;
      void beep(freq, 0.085);
      i += 1;
      setTimeout(step, ms);
    }

    step();
  });
}
