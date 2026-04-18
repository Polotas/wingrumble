/** @typedef {'contain' | 'cover'} CameraFitMode */

const STORAGE_KEY = "webplayground-camera-fit";

export const CAMERA_FIT_CONTAIN = /** @type {const} */ ("contain");
export const CAMERA_FIT_COVER = /** @type {const} */ ("cover");

export const CAMERA_FIT_CHANGE_EVENT = "webplayground-camera-fit-change";

/**
 * `contain` = respeitar proporção (letterbox).
 * `cover` = encher o ecrã (corta bordas, como object-fit: cover).
 */
export function getCameraFitMode() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === CAMERA_FIT_COVER || v === CAMERA_FIT_CONTAIN) return v;
  } catch {
    /* ignore */
  }
  return CAMERA_FIT_CONTAIN;
}

/**
 * @param {CameraFitMode} mode
 */
export function setCameraFitMode(mode) {
  if (mode !== CAMERA_FIT_COVER && mode !== CAMERA_FIT_CONTAIN) return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CAMERA_FIT_CHANGE_EVENT, { detail: { mode } }));
}
