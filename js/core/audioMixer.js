import { getUserPrefs, subscribeUserPrefs } from "./userPrefs.js";

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function getBgVolume() {
  return clamp01(getUserPrefs()?.bgVolume ?? 0);
}

export function getSfxVolume() {
  return clamp01(getUserPrefs()?.sfxVolume ?? 0);
}

/** @type {HTMLAudioElement|null} */
let bgAudio = null;
let bgBaseVolume = 1;
/** @type {number} */
let bgFadeRaf = 0;
/** @type {{ from: number; to: number; startMs: number; durationMs: number; stopOnDone?: boolean } | null} */
let bgFadeState = null;

function ensureBgAudio() {
  if (bgAudio) return bgAudio;
  try {
    bgAudio = new Audio();
    bgAudio.loop = true;
    bgAudio.preload = "auto";
    bgAudio.volume = clamp01(bgBaseVolume * getBgVolume());
  } catch {
    bgAudio = null;
  }
  return bgAudio;
}

function syncBgVolume() {
  if (!bgAudio) return;
  bgAudio.volume = clamp01(bgBaseVolume * getBgVolume());
}

function cancelBgFade() {
  if (bgFadeRaf) cancelAnimationFrame(bgFadeRaf);
  bgFadeRaf = 0;
  bgFadeState = null;
}

/**
 * Fade no volume base da música de fundo (multiplicador do slider de BG do usuário).
 * @param {number} toBaseVolume 0..1
 * @param {{ durationMs?: number; stopOnDone?: boolean }} [opts]
 */
export function fadeBgBaseVolumeTo(toBaseVolume, opts = {}) {
  const { durationMs = 650, stopOnDone = false } = opts;
  const a = ensureBgAudio();
  if (!a) return;

  const to = clamp01(toBaseVolume);
  const from = clamp01(bgBaseVolume);
  cancelBgFade();

  if (durationMs <= 0 || Math.abs(to - from) <= 0.001) {
    bgBaseVolume = to;
    syncBgVolume();
    if (stopOnDone && to <= 0.001) stopBgMusic();
    return;
  }

  bgFadeState = {
    from,
    to,
    startMs: performance.now(),
    durationMs: Math.max(1, durationMs),
    stopOnDone,
  };

  const tick = () => {
    if (!bgFadeState) return;
    const now = performance.now();
    const u = Math.min(1, Math.max(0, (now - bgFadeState.startMs) / bgFadeState.durationMs));
    // easing suave (smoothstep)
    const e = u * u * (3 - 2 * u);
    bgBaseVolume = clamp01(bgFadeState.from + (bgFadeState.to - bgFadeState.from) * e);
    syncBgVolume();
    if (u >= 1) {
      const stop = bgFadeState.stopOnDone && bgFadeState.to <= 0.001;
      cancelBgFade();
      if (stop) stopBgMusic();
      return;
    }
    bgFadeRaf = requestAnimationFrame(tick);
  };
  bgFadeRaf = requestAnimationFrame(tick);
}

/**
 * Define (ou troca) a música de fundo. Só toca se `play=true`.
 * @param {string} src
 * @param {{ play?: boolean; baseVolume?: number }} [opts]
 */
export function setBgMusic(src, opts = {}) {
  const { play = true, baseVolume = 1 } = opts;
  bgBaseVolume = clamp01(baseVolume);
  const a = ensureBgAudio();
  if (!a) return;
  if (a.src !== src) a.src = src;
  syncBgVolume();
  if (play) {
    void a.play().catch(() => {});
  }
}

/**
 * Inicia música de fundo com fade-in suave.
 * @param {string} src
 * @param {{ fadeMs?: number; baseVolume?: number }} [opts]
 */
export function startBgMusicSmooth(src, opts = {}) {
  const { fadeMs = 900, baseVolume = 1 } = opts;
  // Começa do zero (sem "pulo" de volume) e sobe até o volume desejado.
  cancelBgFade();
  setBgMusic(src, { play: true, baseVolume: 0 });
  fadeBgBaseVolumeTo(baseVolume, { durationMs: fadeMs, stopOnDone: false });
}

/**
 * Faz fade-out e pausa a música de fundo ao terminar.
 * @param {{ fadeMs?: number }} [opts]
 */
export function stopBgMusicSmooth(opts = {}) {
  const { fadeMs = 650 } = opts;
  const a = ensureBgAudio();
  if (!a) return;
  if (a.paused) return;
  fadeBgBaseVolumeTo(0, { durationMs: fadeMs, stopOnDone: true });
}

export function stopBgMusic() {
  if (!bgAudio) return;
  cancelBgFade();
  try {
    bgAudio.pause();
  } catch {
    /* ignore */
  }
}

/**
 * Toca um SFX via HTMLAudioElement respeitando o volume master.
 * @param {string} src
 * @param {{ baseVolume?: number }} [opts]
 */
export function playSfx(src, opts = {}) {
  const { baseVolume = 1 } = opts;
  try {
    const a = new Audio(src);
    a.volume = clamp01(clamp01(baseVolume) * getSfxVolume());
    void a.play().catch(() => {});
    return a;
  } catch {
    return null;
  }
}

/** @type {WeakMap<AudioContext, GainNode>} */
const sfxMasterByCtx = new WeakMap();
/** @type {Set<GainNode>} */
const sfxMasters = new Set();

/**
 * Destination para WebAudio SFX (Gain master ligado ao ctx.destination).
 * @param {AudioContext} ctx
 */
export function getSfxDestination(ctx) {
  const existing = sfxMasterByCtx.get(ctx);
  if (existing) return existing;
  const g = ctx.createGain();
  g.gain.value = getSfxVolume();
  g.connect(ctx.destination);
  sfxMasterByCtx.set(ctx, g);
  sfxMasters.add(g);
  return g;
}

export function bindAudioPrefsAutoSync() {
  syncBgVolume();
  return subscribeUserPrefs(() => {
    // BG HTMLAudio
    syncBgVolume();
    // WebAudio masters
    sfxMasters.forEach((g) => {
      try {
        g.gain.value = getSfxVolume();
      } catch {
        /* ignore */
      }
    });
  });
}

