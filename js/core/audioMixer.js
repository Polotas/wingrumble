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

export function stopBgMusic() {
  if (!bgAudio) return;
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

