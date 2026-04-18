/**
 * Carrega fragmentos HTML de `html/pages/` e monta a UI no #app-root.
 * Exige servidor HTTP (mesma origem); não funciona com file://.
 */
import { EMBEDDED_FRAGMENTS } from "./embeddedFragments.js";

const FRAGMENT_PATHS = [
  "../../html/pages/loading-screen.html",
  "../../html/pages/home-screen.html",
  "../../html/pages/mode-select-screen.html",
  "../../html/pages/quick-play-screen.html",
  "../../html/pages/game-select-screen.html",
  "../../html/pages/detection-screen.html",
  "../../html/pages/game-screen.html",
  "../../html/pages/overlay-countdown.html",
  "../../html/pages/panel-results.html",
  "../../html/pages/transition-curtain.html",
];

/**
 * @param {HTMLElement} rootEl
 */
export async function mountScreens(rootEl) {
  const isFileProtocol = window.location?.protocol === "file:";

  if (isFileProtocol) {
    rootEl.innerHTML = EMBEDDED_FRAGMENTS.join("\n");
    return;
  }

  try {
    const chunks = await Promise.all(
      FRAGMENT_PATHS.map(async (rel) => {
        const url = new URL(rel, import.meta.url);
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Falha ao carregar ${url.href}: ${res.status}`);
        }
        return res.text();
      })
    );
    rootEl.innerHTML = chunks.join("\n");
  } catch {
    // Fallback (ex.: hospedeiro que bloqueia fetch de HTML por CORS/mimetype).
    rootEl.innerHTML = EMBEDDED_FRAGMENTS.join("\n");
  }
}
