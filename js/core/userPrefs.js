const LS_KEY = "wingrumble.prefs.v1";

/**
 * @typedef {"pt-BR"|"en"} AppLanguage
 * @typedef {{ language: AppLanguage; bgVolume: number; sfxVolume: number }} UserPrefs
 */

/** @type {UserPrefs} */
const DEFAULT_PREFS = {
  language: "pt-BR",
  bgVolume: 0.6,
  sfxVolume: 0.8,
};

/** @type {UserPrefs} */
let prefs = loadPrefs();

/** @type {Set<(p: UserPrefs) => void>} */
const subs = new Set();

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function normalizeLanguage(x) {
  return x === "en" ? "en" : "pt-BR";
}

function sanitizePrefs(p) {
  return {
    language: normalizeLanguage(p?.language),
    bgVolume: clamp01(p?.bgVolume ?? DEFAULT_PREFS.bgVolume),
    sfxVolume: clamp01(p?.sfxVolume ?? DEFAULT_PREFS.sfxVolume),
  };
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return sanitizePrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(next) {
  prefs = sanitizePrefs(next);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  subs.forEach((cb) => {
    try {
      cb(prefs);
    } catch {
      /* ignore */
    }
  });
}

export function getUserPrefs() {
  return prefs;
}

export function subscribeUserPrefs(cb) {
  subs.add(cb);
  return () => subs.delete(cb);
}

export function setLanguage(language) {
  savePrefs({ ...prefs, language: normalizeLanguage(language) });
}

export function setBgVolume(bgVolume) {
  savePrefs({ ...prefs, bgVolume: clamp01(bgVolume) });
}

export function setSfxVolume(sfxVolume) {
  savePrefs({ ...prefs, sfxVolume: clamp01(sfxVolume) });
}

