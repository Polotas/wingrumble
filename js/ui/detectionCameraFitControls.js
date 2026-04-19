import {
  CAMERA_FIT_CHANGE_EVENT,
  CAMERA_FIT_CONTAIN,
  CAMERA_FIT_COVER,
  getCameraFitMode,
  setCameraFitMode,
} from "../core/cameraDisplayPrefs.js";

/**
 * Liga os botões Proporção / Tela cheia quando não há `readyArena` (ex.: modo debug).
 * @param {HTMLVideoElement} video
 * @returns {() => void}
 */
export function bindDetectionCameraFitControls(video) {
  const btnContain = document.getElementById("btn-camera-fit-contain");
  const btnCover = document.getElementById("btn-camera-fit-cover");

  function syncVideoFitClass() {
    const mode = getCameraFitMode();
    video.classList.remove("camera-fit--contain", "camera-fit--cover");
    video.classList.add(mode === CAMERA_FIT_COVER ? "camera-fit--cover" : "camera-fit--contain");
    if (btnContain && btnCover) {
      const isContain = mode === CAMERA_FIT_CONTAIN;
      btnContain.classList.toggle("camera-fit-toggle__btn--active", isContain);
      btnCover.classList.toggle("camera-fit-toggle__btn--active", !isContain);
      btnContain.setAttribute("aria-pressed", isContain ? "true" : "false");
      btnCover.setAttribute("aria-pressed", !isContain ? "true" : "false");
    }
  }

  function onContain() {
    setCameraFitMode(CAMERA_FIT_CONTAIN);
    syncVideoFitClass();
  }

  function onCover() {
    setCameraFitMode(CAMERA_FIT_COVER);
    syncVideoFitClass();
  }

  function onExternalFit() {
    syncVideoFitClass();
  }

  btnContain?.addEventListener("click", onContain);
  btnCover?.addEventListener("click", onCover);
  window.addEventListener(CAMERA_FIT_CHANGE_EVENT, onExternalFit);
  syncVideoFitClass();

  return () => {
    btnContain?.removeEventListener("click", onContain);
    btnCover?.removeEventListener("click", onCover);
    window.removeEventListener(CAMERA_FIT_CHANGE_EVENT, onExternalFit);
  };
}
