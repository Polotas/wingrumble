const STORAGE_KEY = "wingrumble-blockbreaker-hand-sprites";
export const BLOCKBREAKER_HAND_SPRITES_CHANGE_EVENT = "wingrumble-blockbreaker-hand-sprites-change";

let handSpritesEnabled = true;

function loadFromStorage() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    handSpritesEnabled = v !== "0";
  } catch {
    handSpritesEnabled = true;
  }
}

loadFromStorage();

/** Sprites das mãos no Quebra-blocos (default: ligado). */
export function getBlockBreakerHandSpritesEnabled() {
  return handSpritesEnabled;
}

/**
 * @param {boolean} enabled
 */
export function setBlockBreakerHandSpritesEnabled(enabled) {
  handSpritesEnabled = Boolean(enabled);
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(
    new CustomEvent(BLOCKBREAKER_HAND_SPRITES_CHANGE_EVENT, { detail: { enabled: handSpritesEnabled } }),
  );
}
