import { mountScreens } from "./app/mountScreens.js";
import {
  setupCamera,
  prefersCameraUserGesture,
  isCameraContextOk,
} from "./core/camera.js";
import { CAMERA_FIT_COVER, getCameraFitMode } from "./core/cameraDisplayPrefs.js";
import {
  clearPoseCache,
  initPoseBackend,
  startInferenceLoop,
  stopInferenceLoop,
} from "./core/poseService.js";
import { createReadyArenaScreen } from "./ui/readyArenaScreen.js";
import { createDetectionScreen } from "./ui/detectionScreen.js";
import { bindDetectionCameraFitControls } from "./ui/detectionCameraFitControls.js";
import {
  getBlockBreakerHandSpritesEnabled,
  setBlockBreakerHandSpritesEnabled,
} from "./core/blockBreakerDisplayPrefs.js";
import { createSprintGame } from "./games/sprint100m/sprintGame.js";
import { createBlockBreakerGame } from "./games/blockBreaker/blockBreakerGame.js";
import { createCleanGame } from "./games/cleanScreen/cleanGame.js";
import { createCollectGame } from "./games/collect/collectGame.js";
import { runEndCountdown, runStartCountdown } from "./ui/countdown.js";
import { runBlockBreakerTutorialOverlay } from "./ui/blockBreakerTutorialOverlay.js";
import { runVictorySequence } from "./ui/victorySequence.js";
import { bindI18nAutoApply, t } from "./core/i18n.js";
import { bindAudioPrefsAutoSync, startBgMusicSmooth, stopBgMusicSmooth } from "./core/audioMixer.js";
import {
  getUserPrefs,
  setBgVolume,
  setLanguage,
  setSfxVolume,
  subscribeUserPrefs,
} from "./core/userPrefs.js";
import {
  extractCandidateFromResult,
  getTopScores,
  isSupportedGameId,
  qualifiesForTop,
  saveScore,
  sanitizeName,
} from "./core/rankingStorage.js";
import { enterRankingScreen, wireRankingScreen } from "./ui/rankingScreen.js";

/** @type {"single"|"multi"} */
let gameMode = "multi";

/** Minigame escolhido na tela de jogos (extensível). */
/** @type {string} */
let selectedGameId = "sprint100m";

const QUICK_PLAY_PREP_MS = 3000;

/** @type {{ active: boolean; bestOf: 3|5|7; totalRounds: number; roundsPlayed: number; winsP1: number; winsP2: number; lastGameId: string|null; poolGameIds: string[] }} */
let quickPlay = {
  active: false,
  bestOf: 3,
  totalRounds: 3,
  roundsPlayed: 0,
  winsP1: 0,
  winsP2: 0,
  lastGameId: null,
  poolGameIds: [],
};

/** @type {ReturnType<createReadyArenaScreen>|null} */
let readyArena = null;
/** @type {ReturnType<createDetectionScreen>|null} */
let debugDetection = null;
/** Evita disparar a contagem duas vezes. */
let readyCountdownLock = false;
/** @type {{ start: (opts?: { startPaused?: boolean }) => void; stop: () => void; resumeGameplay?: () => void }|null} */
let currentGame = null;

/** False quando getUserMedia falhou (ex.: preview embutido do Cursor sem câmera). */
let cameraAvailable = false;

/** @type {HTMLVideoElement|null} */
let video = null;

let globalFullscreenLocked = false;

function setGlobalFullscreenLocked(locked) {
  globalFullscreenLocked = Boolean(locked);
  document.body.classList.toggle("global-fullscreen--hidden", globalFullscreenLocked);
}

let loadingTipsTimer = 0;
let loadingTipsIdx = 0;
const LOADING_TIP_KEYS = [
  "loading.tip.0",
  "loading.tip.1",
  "loading.tip.2",
  "loading.tip.3",
  "loading.tip.4",
];

/** @type {{ items: HTMLButtonElement[]; index: number; viewport: HTMLElement|null; track: HTMLElement|null; navPrev: HTMLButtonElement|null; navNext: HTMLButtonElement|null; confirmBtn: HTMLButtonElement|null } | null} */
let gameCarousel = null;

/** Destino ao clicar em Voltar na tela de detecção (calibração → game-select; debug da home → home). */
let detectionReturnPhase = "game-select";
/** Limiar dinâmico (0–1) para overlay de debug. */
const debugScoreThresholdRef = { value: 0.25 };
/** Cleanup dos botões contain/cover no modo debug (sem `readyArena`). */
let debugCameraFitUnbind = null;

const BLOCKBREAKER_BG_MUSIC_URL = new URL(
  "../assets/audios/BlockBreaker/audio_bg.mp3",
  import.meta.url,
).href;

async function maybeRunBlockBreakerTutorial() {
  if (selectedGameId !== "blockBreaker") return;
  const wrapEl = document.getElementById("overlay-blockbreaker-tutorial-wrap");
  const imgEl = /** @type {HTMLImageElement|null} */ (
    document.getElementById("overlay-blockbreaker-tutorial-img")
  );
  const textEl = document.getElementById("overlay-blockbreaker-tutorial-text");
  const timerEl = document.getElementById("overlay-blockbreaker-tutorial-timer");
  if (!wrapEl || !imgEl || !timerEl) return;
  await runBlockBreakerTutorialOverlay({
    wrapEl,
    imgEl,
    textEl: textEl ?? undefined,
    timerEl,
    durationMs: 5000,
    swapMs: 1000,
  });
}

function stopLoadingTips() {
  if (loadingTipsTimer) window.clearInterval(loadingTipsTimer);
  loadingTipsTimer = 0;
}

function startLoadingTips() {
  const tipEl = document.getElementById("loading-tip");
  if (!tipEl) return;
  stopLoadingTips();
  loadingTipsIdx = 0;
  tipEl.textContent = t(LOADING_TIP_KEYS[0] ?? "") ?? "";

  loadingTipsTimer = window.setInterval(() => {
    const el = document.getElementById("loading-tip");
    if (!el) {
      stopLoadingTips();
      return;
    }
    el.classList.add("loading-tip--fade");
    window.setTimeout(() => {
      loadingTipsIdx = (loadingTipsIdx + 1) % LOADING_TIP_KEYS.length;
      el.textContent = t(LOADING_TIP_KEYS[loadingTipsIdx] ?? "") ?? "";
      el.classList.remove("loading-tip--fade");
    }, 220);
  }, 3200);
}

function setPhase(phase) {
  const root = document.body;
  if (phase === "loading") startLoadingTips();
  else stopLoadingTips();
  root.classList.remove(
    "phase-loading",
    "phase-home",
    "phase-mode-select",
    "phase-quick-play",
    "phase-game-select",
    "phase-ranking",
    "phase-detection",
    "phase-game"
  );
  const map = {
    game: "phase-game",
    detection: "phase-detection",
    loading: "phase-loading",
    home: "phase-home",
    "mode-select": "phase-mode-select",
    "quick-play": "phase-quick-play",
    "game-select": "phase-game-select",
    ranking: "phase-ranking",
  };
  root.classList.add(map[phase] || "phase-home");
  if (phase === "home") syncHomeDebugButton();
}

function syncHomeDebugButton() {
  const btn = document.getElementById("btn-home-debug");
  if (btn) btn.hidden = !isLocalDebugAllowed();
}

function hideDebugDetectionPanel() {
  const extra = document.getElementById("debug-detection-extra");
  if (extra) extra.hidden = true;
}

function showDebugDetectionPanel() {
  const extra = document.getElementById("debug-detection-extra");
  if (extra) extra.hidden = false;
}

function syncBlockBreakerHandSpritesCheckbox() {
  const cb = /** @type {HTMLInputElement|null} */ (
    document.getElementById("debug-blockbreaker-hand-sprites")
  );
  if (cb) cb.checked = getBlockBreakerHandSpritesEnabled();
}

function syncDebugScoreSliderFromRef() {
  const slider = /** @type {HTMLInputElement|null} */ (document.getElementById("debug-detection-score"));
  const out = document.getElementById("debug-detection-score-value");
  const pct = Math.round(debugScoreThresholdRef.value * 100);
  if (slider) {
    slider.value = String(pct);
    slider.setAttribute("aria-valuenow", String(pct));
  }
  if (out) out.textContent = debugScoreThresholdRef.value.toFixed(2);
}

/**
 * Após escolher 1 ou 2 jogadores na home — seleção de modo.
 * @param {"single"|"multi"} mode
 */
function enterModeSelect(mode) {
  gameMode = mode;
  const playersBadge = document.getElementById("mode-select-players");
  if (playersBadge) {
    playersBadge.textContent = mode === "single" ? t("players.one") : t("players.two");
  }
  setPhase("mode-select");
}

function runUiScreenSwap(toPhase, applyPhase) {
  const root = document.body;
  root.classList.add("ui-transitioning");
  window.setTimeout(() => {
    applyPhase();
    // Força estado “enter” antes do settle
    root.classList.remove("ui-transitioning");
    root.classList.add("ui-transition-enter");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove("ui-transition-enter");
      });
    });
  }, 220);
}

function isLocalDebugAllowed() {
  const p = window.location?.protocol || "";
  const h = window.location?.hostname || "";
  if (p === "file:") return true;
  return h === "localhost" || h === "127.0.0.1";
}

/**
 * Configuração do Quick Play (best-of).
 */
function enterQuickPlay() {
  const playersBadge = document.getElementById("quick-play-players");
  if (playersBadge) {
    playersBadge.textContent = gameMode === "single" ? t("players.one") : t("players.two");
  }
  setPhase("quick-play");
}

/**
 * Seleção de minigame (tela atual).
 */
function enterGameSelect() {
  const playersBadge = document.getElementById("game-select-players");
  if (playersBadge) {
    playersBadge.textContent = gameMode === "single" ? t("players.one") : t("players.two");
  }
  setPhase("game-select");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ensureGameCarousel();
    });
  });
}

/**
 * Tela de Ranking (single-player): lista de minigames + detalhe com Top 10.
 */
function enterRanking() {
  enterRankingScreen();
  setPhase("ranking");
}

function getQuickPlayBestOfFromUI() {
  const checked = /** @type {HTMLInputElement|null} */ (
    document.querySelector('input[name="quick-play-bestof"]:checked')
  );
  const n = Number.parseInt(checked?.value ?? "3", 10);
  if (n === 5) return /** @type {5} */ (5);
  if (n === 7) return /** @type {7} */ (7);
  return /** @type {3} */ (3);
}

function getActiveGameIdsFromDom() {
  const buttons = Array.from(
    document.querySelectorAll("#screen-game-select button[data-game-id]")
  );
  return buttons
    .filter((el) => {
      const btn = /** @type {HTMLButtonElement} */ (el);
      if (btn.disabled) return false;
      return btn.classList.contains("game-card--active");
    })
    .map((el) => String(el.getAttribute("data-game-id") || "").trim())
    .filter(Boolean);
}

/**
 * @param {string[]} pool
 * @param {string|null} last
 */
function pickNextGameId(pool, last) {
  if (!pool?.length) return "blockBreaker";
  if (pool.length === 1) return pool[0];
  const choices = last ? pool.filter((g) => g !== last) : pool.slice();
  const list = choices.length ? choices : pool;
  return list[Math.floor(Math.random() * list.length)];
}

function buildGameCarousel() {
  const screen = document.getElementById("screen-game-select");
  if (!screen) return null;
  const viewport = screen.querySelector("[data-game-carousel-viewport]");
  const track = screen.querySelector("[data-game-carousel-track]");
  const navPrev = screen.querySelector(".game-carousel__nav--prev");
  const navNext = screen.querySelector(".game-carousel__nav--next");
  const confirmBtn = screen.querySelector("#btn-game-select-confirm");
  if (!viewport || !track) return null;

  const items = Array.from(track.querySelectorAll('button[data-game-id]')).filter((el) => {
    const btn = /** @type {HTMLButtonElement} */ (el);
    if (btn.disabled) return false;
    return btn.classList.contains("game-card--active");
  });

  const idx = Math.max(
    0,
    items.findIndex((b) => b.getAttribute("data-game-id") === selectedGameId),
  );

  return {
    items,
    index: idx >= 0 ? idx : 0,
    viewport: /** @type {HTMLElement} */ (viewport),
    track: /** @type {HTMLElement} */ (track),
    navPrev: /** @type {HTMLButtonElement|null} */ (navPrev),
    navNext: /** @type {HTMLButtonElement|null} */ (navNext),
    confirmBtn: /** @type {HTMLButtonElement|null} */ (confirmBtn),
  };
}

function carouselUpdateLayout() {
  if (!gameCarousel?.viewport || !gameCarousel.track) return;
  const { viewport, track, items, index, navPrev, navNext } = gameCarousel;
  const n = items.length;

  for (let k = 0; k < items.length; k += 1) {
    const el = items[k];
    const sel = k === index;
    el.classList.toggle("is-selected", sel);
    if (sel) el.setAttribute("aria-current", "true");
    else el.removeAttribute("aria-current");
  }

  const canNav = n > 1;
  if (navPrev) navPrev.disabled = !canNav;
  if (navNext) navNext.disabled = !canNav;

  if (n < 1) {
    track.style.transform = "translateX(0px)";
    return;
  }

  const vpRect = viewport.getBoundingClientRect();
  const selRect = items[index].getBoundingClientRect();
  const delta = (vpRect.left + vpRect.width / 2) - (selRect.left + selRect.width / 2);

  const m = /translateX\(([-0-9.]+)px\)/.exec(track.style.transform || "");
  const cur = m ? Number.parseFloat(m[1]) : 0;
  track.style.transform = `translateX(${Math.round(cur + delta)}px)`;
}

function carouselSelectIndex(nextIndex) {
  if (!gameCarousel?.items?.length) return;
  const n = gameCarousel.items.length;
  const i = ((nextIndex % n) + n) % n;
  const prevIndex = gameCarousel.index;
  gameCarousel.index = i;
  const btn = gameCarousel.items[i];
  selectedGameId = String(btn.getAttribute("data-game-id") || selectedGameId);
  carouselUpdateLayout();

  // Feedback visual no item recém-selecionado (classe temporária para animar no CSS).
  if (prevIndex !== i) {
    const prevBtn = gameCarousel.items[prevIndex];
    if (prevBtn) prevBtn.classList.remove("is-just-selected");
    btn.classList.remove("is-just-selected");
    requestAnimationFrame(() => {
      btn.classList.add("is-just-selected");
      window.setTimeout(() => btn.classList.remove("is-just-selected"), 320);
    });
  }
}

function ensureGameCarousel() {
  gameCarousel = buildGameCarousel();
  if (!gameCarousel) return;
  carouselSelectIndex(gameCarousel.index);
}

function quickPlayReset(bestOf, pool) {
  quickPlay = {
    active: true,
    bestOf,
    totalRounds: bestOf,
    roundsPlayed: 0,
    winsP1: 0,
    winsP2: 0,
    lastGameId: null,
    poolGameIds: pool,
  };
}

function showResultsPanelText(title, body) {
  const titleEl = document.getElementById("results-title");
  const bodyEl = document.getElementById("results-body");
  const panel = document.getElementById("panel-results");
  const newRecord = document.getElementById("panel-results-new-record");
  const actions = panel?.querySelector(".panel-results__actions");
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) {
    bodyEl.textContent = body;
    bodyEl.hidden = false;
  }
  if (newRecord) newRecord.hidden = true;
  if (actions instanceof HTMLElement) actions.hidden = false;
  if (panel) panel.hidden = false;
  setGlobalFullscreenLocked(false);

  const videoEl = video ?? document.getElementById("camera");
  void videoEl?.play?.().catch(() => {});
}

function setOverlayCountdownMessageMode(on) {
  const overlayCountdown = document.getElementById("overlay-countdown");
  if (!overlayCountdown) return;
  overlayCountdown.classList.toggle("overlay-countdown--message", Boolean(on));
}

/**
 * @param {string[]} lines
 */
async function showPrepOverlay(lines) {
  const textEl = document.getElementById("overlay-countdown");
  const wrapEl = document.getElementById("overlay-countdown-wrap");
  if (!textEl || !wrapEl) return;
  setGlobalFullscreenLocked(true);
  setOverlayCountdownMessageMode(true);
  wrapEl.classList.add("overlay-countdown-wrap--visible");
  wrapEl.classList.remove("overlay-countdown-wrap--no-dim");
  wrapEl.setAttribute("aria-hidden", "false");
  textEl.textContent = lines.join("\n");
  await new Promise((r) => setTimeout(r, QUICK_PLAY_PREP_MS));
  textEl.textContent = "";
  wrapEl.classList.remove("overlay-countdown-wrap--visible");
  wrapEl.setAttribute("aria-hidden", "true");
  setOverlayCountdownMessageMode(false);
}

function moveVideoToGamePreview() {
  const previewSlot = document.getElementById("preview-slot");
  const previewOverlay = document.getElementById("preview-overlay");
  if (!video || !previewSlot) return;
  if (previewOverlay) {
    previewSlot.insertBefore(video, previewOverlay);
  } else {
    previewSlot.appendChild(video);
  }
  video.classList.remove("camera--detection", "camera-fit--contain", "camera-fit--cover");
  video.classList.add("camera--preview");
  const stream = video.srcObject;
  if (stream) {
    video.srcObject = null;
    video.srcObject = stream;
  }
  void video.play().catch(() => {});
  void previewSlot.offsetHeight;
}

function moveVideoToCalibration() {
  const videoStack = document.querySelector(".video-stack");
  const overlayDetection = document.getElementById("overlay-detection");
  if (!video) return;
  if (videoStack && overlayDetection) {
    videoStack.insertBefore(video, overlayDetection);
  } else if (videoStack) {
    videoStack.appendChild(video);
  }
  video.classList.remove("camera--preview");
  video.classList.add("camera--detection");
  video.classList.remove("camera-fit--contain", "camera-fit--cover");
  video.classList.add(
    getCameraFitMode() === CAMERA_FIT_COVER ? "camera-fit--cover" : "camera-fit--contain",
  );
  const stream = video.srcObject;
  if (stream) {
    video.srcObject = null;
    video.srcObject = stream;
  }
  void video.play().catch(() => {});
}

const SCREEN_TRANSITION_MS = 280;

/**
 * Fade escuro ao sair da seleção de minigame → calibração.
 * @param {() => void} onMidTransition — troca de fase quando o ecrã está escuro.
 */
function runScreenTransition(onMidTransition) {
  const el = document.getElementById("transition-curtain");
  if (!el) {
    onMidTransition();
    return;
  }
  el.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.add("transition-curtain--visible");
    });
  });
  window.setTimeout(() => {
    onMidTransition();
    requestAnimationFrame(() => {
      el.classList.remove("transition-curtain--visible");
      window.setTimeout(() => {
        el.setAttribute("aria-hidden", "true");
      }, 300);
    });
  }, SCREEN_TRANSITION_MS);
}

/**
 * @param {object} result
 * @param {string} [result.gameId]
 * @param {1|2|null} [result.winner]
 * @param {number} [result.timeSec]
 * @param {number} [result.timeP1]
 * @param {number} [result.timeP2]
 * @param {number} [result.scoreP1]
 * @param {number} [result.scoreP2]
 * @param {number} [result.scoreTotal]
 * @param {"single"|"multi"} [result.mode]
 */
/**
 * @param {"blockBreaker"|"cleanScreen"|"collect"} gameId
 */
function formatBestRankingLine(gameId) {
  const list = getTopScores(gameId);
  if (!list.length) {
    return "Melhor no ranking: ainda sem registros salvos.";
  }
  const e = list[0];
  if (gameId === "blockBreaker") {
    return `Melhor no ranking: ${e.name} — ${e.score} pts • ${e.timeSec.toFixed(2)} s`;
  }
  return `Melhor no ranking: ${e.name} — ${e.score} pts`;
}

function formatResultsText(result) {
  const mode = result.mode;
  const lines = [];

  if (mode === "multi") {
    const w = result.winner;
    if (w === 1 || w === 2) lines.push(`Vencedor: P${w}`);
  }

  const hasScores =
    Number.isFinite(result.scoreP1) ||
    Number.isFinite(result.scoreP2) ||
    Number.isFinite(result.scoreTotal);

  if (hasScores) {
    const s1 = Math.round(result.scoreP1 ?? 0);
    const s2 = Math.round(result.scoreP2 ?? 0);
    if (mode === "single") {
      lines.push(`Pontuação: ${s1}`);
    } else {
      lines.push(`P1: ${s1}`);
      lines.push(`P2: ${s2}`);
    }
  } else {
    const t1 = Number.isFinite(result.timeP1) ? result.timeP1 : 0;
    const t2 = Number.isFinite(result.timeP2) ? result.timeP2 : 0;
    if (mode === "single") {
      lines.push(`Tempo: ${t1.toFixed(2)} s`);
    } else {
      lines.push(`P1: ${t1.toFixed(2)} s`);
      lines.push(`P2: ${t2.toFixed(2)} s`);
    }
  }

  const gid = result.gameId;
  if (typeof gid === "string" && isSupportedGameId(gid)) {
    lines.push("");
    lines.push(formatBestRankingLine(gid));
  }

  return lines.join("\n");
}

/**
 * Candidato de novo recorde pendente (aguardando input do nome no painel de resultados).
 * Preenchido em `handleGameFinish` quando um resultado single-player qualifica para o Top 10.
 * @type {{ gameId: "blockBreaker"|"cleanScreen"|"collect", score: number, timeSec: number }|null}
 */
let pendingHighScore = null;

/**
 * @param {"blockBreaker"|"cleanScreen"|"collect"} gameId
 * @param {number} score
 * @param {number} timeSec
 */
function formatScoreSub(gameId, score, timeSec) {
  if (gameId === "blockBreaker") {
    return `em ${timeSec.toFixed(2)} s`;
  }
  return "";
}

/**
 * @param {number} score
 */
function formatScoreBig(score) {
  const n = Math.round(score);
  return `${n} ${n === 1 ? "ponto" : "pontos"}`;
}

/**
 * Projeta a posição (1-based) que o candidato assumiria no Top 10.
 * Replica a ordenação de `rankingStorage.compareEntries`.
 * @param {"blockBreaker"|"cleanScreen"|"collect"} gameId
 * @param {{ score: number, timeSec: number }} candidate
 * @returns {number} posição 1..10, ou 0 se não entra no Top 10
 */
function projectRank(gameId, candidate) {
  const list = getTopScores(gameId);
  let pos = 1;
  for (const e of list) {
    const dScore = (e.score ?? 0) - (candidate.score ?? 0);
    if (dScore > 0) {
      pos += 1;
      continue;
    }
    if (dScore === 0 && gameId === "blockBreaker") {
      if ((e.timeSec ?? 0) < (candidate.timeSec ?? 0)) {
        pos += 1;
        continue;
      }
    }
    break;
  }
  return pos <= 10 ? pos : 0;
}

/**
 * @param {number} rank  posição 1..10
 */
function medalClassFor(rank) {
  if (rank === 1) return "panel-results__medal--gold";
  if (rank === 2) return "panel-results__medal--silver";
  if (rank === 3) return "panel-results__medal--bronze";
  return "panel-results__medal--neutral";
}

/**
 * @param {number} rank
 */
function setMedalRank(rank) {
  const medalEl = document.getElementById("panel-results-medal");
  if (!(medalEl instanceof HTMLElement)) return;
  medalEl.textContent = String(rank);
  medalEl.setAttribute("data-rank", String(rank));
  medalEl.classList.remove(
    "panel-results__medal--gold",
    "panel-results__medal--silver",
    "panel-results__medal--bronze",
    "panel-results__medal--neutral",
  );
  medalEl.classList.add(medalClassFor(rank));
  // Reinicia a animação de entrada trocando o nó visualmente (clonar classList).
  medalEl.style.animation = "none";
  // Força reflow
  void medalEl.offsetHeight;
  medalEl.style.animation = "";
}

function showResultsPanel(result) {
  const resultsBody = document.getElementById("results-body");
  const resultsTitle = document.getElementById("results-title");
  const panelResults = document.getElementById("panel-results");
  const newRecord = document.getElementById("panel-results-new-record");
  const newRecordSummary = document.getElementById("panel-results-new-record-summary");
  const scoreBig = document.getElementById("panel-results-score-big");
  const form = document.getElementById("panel-results-form");
  const saved = document.getElementById("panel-results-saved");
  const nameInput = /** @type {HTMLInputElement|null} */ (
    document.getElementById("input-record-name")
  );
  const actions = panelResults?.querySelector(".panel-results__actions");
  if (resultsTitle) resultsTitle.textContent = t("results.title");
  if (resultsBody) resultsBody.textContent = formatResultsText(result);

  const showRecord = pendingHighScore !== null;
  if (newRecord) newRecord.hidden = !showRecord;
  if (resultsBody) resultsBody.hidden = showRecord;
  if (actions instanceof HTMLElement) {
    actions.hidden = showRecord;
    actions.classList.remove("panel-results__actions--fade-in");
  }

  if (showRecord && pendingHighScore) {
    const rank = projectRank(pendingHighScore.gameId, {
      score: pendingHighScore.score,
      timeSec: pendingHighScore.timeSec,
    });
    const safeRank = rank > 0 ? rank : 1;
    setMedalRank(safeRank);
    if (scoreBig) scoreBig.textContent = formatScoreBig(pendingHighScore.score);
    if (newRecordSummary) {
      newRecordSummary.textContent = formatScoreSub(
        pendingHighScore.gameId,
        pendingHighScore.score,
        pendingHighScore.timeSec,
      );
    }
    if (form) form.hidden = false;
    if (saved) saved.hidden = true;
  }

  if (showRecord && nameInput) {
    nameInput.value = "";
    requestAnimationFrame(() => {
      try {
        nameInput.focus();
      } catch {
        /* ignore */
      }
    });
  }

  if (panelResults) panelResults.hidden = false;
  setGlobalFullscreenLocked(false);

  // Alguns navegadores podem pausar o <video> em mudanças de UI/overlay.
  // Garantimos que a câmera continue tocando enquanto o painel aparece.
  const videoEl = video ?? document.getElementById("camera");
  void videoEl?.play?.().catch(() => {});
}

/** Confetes + título + coroa; depois o painel de resultados. */
function handleGameFinish(result) {
  // BlockBreaker: desliga BG suavemente ao acabar a partida.
  if (result?.gameId === "blockBreaker") {
    try {
      stopBgMusicSmooth({ fadeMs: 850 });
    } catch {
      /* ignore */
    }
  }
  const videoEl = video ?? document.getElementById("camera");
  pendingHighScore = null;
  if (!quickPlay.active) {
    const candidate = extractCandidateFromResult(result);
    if (candidate && qualifiesForTop(candidate.gameId, candidate)) {
      pendingHighScore = candidate;
    }
    void runVictorySequence({
      video: videoEl,
      result,
      onComplete: () => showResultsPanel(result),
    });
    return;
  }

  void runVictorySequence({
    video: videoEl,
    result,
    onComplete: () => {
      void (async () => {
        const w = result?.winner;
        if (w === 1) quickPlay.winsP1 += 1;
        else if (w === 2) quickPlay.winsP2 += 1;

        quickPlay.roundsPlayed += 1;
        const isOver = quickPlay.roundsPlayed >= quickPlay.totalRounds;

        if (isOver) {
          const isSingle = gameMode === "single" || result?.mode === "single";
          const winner = isSingle
            ? ""
            : quickPlay.winsP1 > quickPlay.winsP2
              ? "P1"
              : quickPlay.winsP2 > quickPlay.winsP1
                ? "P2"
                : "Empate";
          const title = "Quick Play — Fim de jogo";
          const body = isSingle
            ? `Rounds: ${quickPlay.totalRounds}/${quickPlay.totalRounds}`
            : `Vencedor da série: ${winner}\n` +
              `Melhor de ${quickPlay.bestOf}\n` +
              `P1: ${quickPlay.winsP1} vitória(s)\n` +
              `P2: ${quickPlay.winsP2} vitória(s)`;
          quickPlay.active = false;
          showResultsPanelText(title, body);
          return;
        }

        const isSingle = gameMode === "single" || result?.mode === "single";
        await showPrepOverlay(
          isSingle
            ? [
                "Se prepare",
                `Round ${quickPlay.roundsPlayed + 1} de ${quickPlay.totalRounds}`,
              ]
            : [
                "Se prepare",
                `Round ${quickPlay.roundsPlayed + 1} de ${quickPlay.totalRounds}`,
                `P1: ${quickPlay.winsP1}  •  P2: ${quickPlay.winsP2}`,
              ],
        );

        const next = pickNextGameId(quickPlay.poolGameIds, quickPlay.lastGameId);
        quickPlay.lastGameId = next;
        selectedGameId = next;

        const overlayCountdown = document.getElementById("overlay-countdown");
        const overlayCountdownWrap = document.getElementById("overlay-countdown-wrap");
        try {
          await goToGame({ startPaused: true });
          if (overlayCountdown) {
            setGlobalFullscreenLocked(true);
            await maybeRunBlockBreakerTutorial();
            await runStartCountdown(overlayCountdown, { wrapEl: overlayCountdownWrap ?? undefined });
          }
          if (selectedGameId === "blockBreaker") {
            try {
              startBgMusicSmooth(BLOCKBREAKER_BG_MUSIC_URL, { fadeMs: 1000, baseVolume: 1 });
            } catch {
              /* ignore */
            }
          }
          currentGame?.resumeGameplay?.();
        } catch {
          /* ignore */
        }
      })();
    },
  });
}

function hideResultsPanel() {
  const panelResults = document.getElementById("panel-results");
  if (panelResults) panelResults.hidden = true;
  const newRecord = document.getElementById("panel-results-new-record");
  if (newRecord) newRecord.hidden = true;
  pendingHighScore = null;
}

function getDetectionStatusBase() {
  return t("detection.status.base");
}

function stopCameraSession() {
  hideDebugDetectionPanel();
  document.getElementById("screen-detection")?.classList.remove("screen-detection--debug");
  if (debugCameraFitUnbind) {
    debugCameraFitUnbind();
    debugCameraFitUnbind = null;
  }
  stopInferenceLoop();
  clearPoseCache();
  if (debugDetection) {
    try {
      debugDetection.stop();
    } catch {
      /* ignore */
    }
    debugDetection = null;
  }
  const videoEl = /** @type {HTMLVideoElement|null} */ (document.getElementById("camera"));
  if (!videoEl) {
    cameraAvailable = false;
    return;
  }
  const stream = /** @type {MediaStream|null} */ (videoEl.srcObject || null);
  if (stream?.getTracks) {
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
  }
  videoEl.srcObject = null;
  cameraAvailable = false;
}

/**
 * Antes do jogo: zonas P1 (esquerda) / P2 (direita), mão visível, contagem 3-2-1 automática.
 * @param {"single"|"multi"} mode
 */
function enterReadyArena(mode) {
  const videoEl = document.getElementById("camera");
  const overlayDetection = document.getElementById("overlay-detection");
  const overlayCountdown = document.getElementById("overlay-countdown");
  const statusText = document.getElementById("status-text");
  const screenDetection = document.getElementById("screen-detection");
  const btnCameraStart = document.getElementById("btn-camera-start");
  const camLoading = screenDetection?.querySelector?.("[data-camera-loading]");
  const camLoadingText = screenDetection?.querySelector?.("[data-camera-loading-text]");
  if (!videoEl || !overlayDetection) return;

  detectionReturnPhase = "game-select";
  hideDebugDetectionPanel();
  screenDetection?.classList.remove("screen-detection--debug");
  if (debugCameraFitUnbind) {
    debugCameraFitUnbind();
    debugCameraFitUnbind = null;
  }

  gameMode = mode;
  screenDetection?.classList.remove("screen-detection--countdown-ui-hidden");
  moveVideoToCalibration();
  setPhase("detection");

  if (debugDetection) {
    try {
      debugDetection.stop();
    } catch {
      /* ignore */
    }
    debugDetection = null;
  }

  if (readyArena) {
    try {
      readyArena.stop();
    } catch {
      /* ignore */
    }
    readyArena = null;
  }

  if (statusText) {
    statusText.textContent = getDetectionStatusBase();
  }

  function setCameraLoading(on, text) {
    if (!camLoading) return;
    const show = Boolean(on);
    camLoading.hidden = !show;
    camLoading.setAttribute("aria-hidden", show ? "false" : "true");
    if (camLoadingText && typeof text === "string" && text.length) {
      camLoadingText.textContent = text;
    }
    if (!show && camLoadingText) {
      camLoadingText.textContent = "";
    }
  }

  /** Espera o vídeo ter dimensões / primeiro frame (evita overlay sumir antes da imagem aparecer). */
  function waitForCameraPicture(video) {
    return new Promise((resolve) => {
      const ok = () =>
        video.videoWidth > 1 && video.videoHeight > 1 && video.readyState >= 2;
      if (ok()) {
        requestAnimationFrame(() => resolve());
        return;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        video.removeEventListener("loadeddata", finish);
        video.removeEventListener("playing", finish);
        video.removeEventListener("canplay", finish);
        window.clearTimeout(tid);
        requestAnimationFrame(() => resolve());
      };
      const tid = window.setTimeout(finish, 2500);
      video.addEventListener("loadeddata", finish);
      video.addEventListener("playing", finish);
      video.addEventListener("canplay", finish);
    });
  }

  function startArenaUi() {
    readyArena = createReadyArenaScreen({
      video: videoEl,
      overlayCanvas: overlayDetection,
      gameMode: mode,
      statusTextEl: statusText ?? undefined,
      statusBaseText: getDetectionStatusBase(),
      onReady() {
        if (readyCountdownLock || !overlayCountdown) return;
        readyCountdownLock = true;
        setGlobalFullscreenLocked(true);
        try {
          readyArena?.stop();
        } catch {
          /* ignore */
        }
        readyArena = null;
        screenDetection?.classList.add("screen-detection--countdown-ui-hidden");
        const wrapEl = document.getElementById("overlay-countdown-wrap");
        void (async () => {
          try {
            await goToGame({ startPaused: true });
            setGlobalFullscreenLocked(true);
            await maybeRunBlockBreakerTutorial();
            await runStartCountdown(overlayCountdown, {
              wrapEl: wrapEl ?? undefined,
            });
            if (selectedGameId === "blockBreaker") {
              try {
                startBgMusicSmooth(BLOCKBREAKER_BG_MUSIC_URL, { fadeMs: 1000, baseVolume: 1 });
              } catch {
                /* ignore */
              }
            }
            currentGame?.resumeGameplay?.();
          } finally {
            readyCountdownLock = false;
            screenDetection?.classList.remove("screen-detection--countdown-ui-hidden");
          }
        })();
      },
    });
    readyArena.start();
  }

  async function startCameraAndArena() {
    if (!isCameraContextOk()) {
      if (statusText) {
        statusText.textContent = t("detection.error.https");
      }
      return;
    }
    if (btnCameraStart) {
      btnCameraStart.hidden = true;
      btnCameraStart.disabled = false;
    }
    try {
      if (!videoEl.srcObject) {
        setCameraLoading(true, t("detection.cameraLoading"));
        await setupCamera(videoEl);
      }
      await waitForCameraPicture(videoEl);
      cameraAvailable = true;
      setCameraLoading(false);
      if (statusText) statusText.textContent = getDetectionStatusBase();
      startInferenceLoop(videoEl);
      startArenaUi();
    } catch {
      cameraAvailable = false;
      setCameraLoading(false);
      if (statusText) {
        statusText.textContent = t("detection.error.permissions");
      }
      if (btnCameraStart) btnCameraStart.disabled = false;
    }
  }

  // Se o browser exigir gesto (mobile), pedimos permissão ao entrar na calibração via botão.
  const needsGesture = prefersCameraUserGesture();
  const hasStream = Boolean(videoEl.srcObject);
  if (!hasStream && needsGesture) {
    if (btnCameraStart) {
      btnCameraStart.hidden = false;
      btnCameraStart.disabled = false;
      setCameraLoading(true, t("detection.tapToAllow"));
      btnCameraStart.onclick = async () => {
        btnCameraStart.disabled = true;
        if (statusText) statusText.textContent = t("detection.openingCamera");
        setCameraLoading(true, t("detection.cameraLoading"));
        await startCameraAndArena();
        if (cameraAvailable) {
          btnCameraStart.hidden = true;
          setCameraLoading(false);
          if (statusText) statusText.textContent = getDetectionStatusBase();
        }
      };
    } else {
      // Sem botão disponível, tenta mesmo assim.
      void startCameraAndArena();
    }
    return;
  }

  // Desktop/ambiente sem necessidade de gesto: solicita ao entrar na calibração.
  void startCameraAndArena();
}

/**
 * Debug de pose: abre a tela de deteção e desenha skeleton + labels.
 * Não dispara contagem nem inicia jogo automaticamente.
 */
function enterDebugDetection() {
  const videoEl = document.getElementById("camera");
  const overlayDetection = /** @type {HTMLCanvasElement|null} */ (
    document.getElementById("overlay-detection")
  );
  const screenDetection = document.getElementById("screen-detection");
  if (!videoEl || !overlayDetection) return;

  detectionReturnPhase = "home";
  debugScoreThresholdRef.value = 0.25;
  showDebugDetectionPanel();
  syncDebugScoreSliderFromRef();
  syncBlockBreakerHandSpritesCheckbox();

  screenDetection?.classList.remove("screen-detection--countdown-ui-hidden");
  screenDetection?.classList.add("screen-detection--debug");
  moveVideoToCalibration();
  setPhase("detection");

  if (debugCameraFitUnbind) {
    debugCameraFitUnbind();
    debugCameraFitUnbind = null;
  }

  if (readyArena) {
    try {
      readyArena.stop();
    } catch {
      /* ignore */
    }
    readyArena = null;
  }
  readyCountdownLock = false;

  if (debugDetection) {
    try {
      debugDetection.stop();
    } catch {
      /* ignore */
    }
    debugDetection = null;
  }

  debugDetection = createDetectionScreen({
    video: videoEl,
    overlayCanvas: overlayDetection,
    gameMode: "multi",
    debugMode: true,
    showKeypointLabels: true,
    getMinScore: () => debugScoreThresholdRef.value,
  });

  debugCameraFitUnbind = bindDetectionCameraFitControls(videoEl);

  async function startCameraAndDebug() {
    if (!isCameraContextOk()) return;
    try {
      if (!videoEl.srcObject) {
        await setupCamera(videoEl);
      }
      void videoEl.play?.().catch(() => {});
      startInferenceLoop(videoEl);
      debugDetection?.start();
    } catch {
      /* ignore */
    }
  }

  void startCameraAndDebug();
}

/**
 * @param {{ startPaused?: boolean }} [opts]
 */
async function startSprintGame(opts = {}) {
  const { startPaused = false } = opts;
  const gameCanvas = document.getElementById("game");
  const previewOverlay = document.getElementById("preview-overlay");
  const videoEl = document.getElementById("camera");
  const screenGame = document.getElementById("screen-game");
  if (!gameCanvas || !videoEl) return;

  screenGame?.classList.remove("screen-game--no-preview");
  setPhase("game");
  if (currentGame) {
    currentGame.stop();
    currentGame = null;
  }
  video = videoEl;
  moveVideoToGamePreview();

  await new Promise((r) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(r);
    });
  });

  currentGame = createSprintGame(gameCanvas, {
    video: videoEl,
    previewOverlay: previewOverlay || undefined,
    mode: gameMode,
    onFinish(result) {
      handleGameFinish(result);
    },
  });
  currentGame.start({ startPaused });
}

/**
 * @param {{ startPaused?: boolean }} [opts]
 */
async function startBlockBreakerGame(opts = {}) {
  const { startPaused = false } = opts;
  const gameCanvas = document.getElementById("game");
  const videoEl = document.getElementById("camera");
  const screenGame = document.getElementById("screen-game");
  if (!gameCanvas || !videoEl) return;

  screenGame?.classList.add("screen-game--no-preview");
  setPhase("game");
  if (currentGame) {
    currentGame.stop();
    currentGame = null;
  }
  video = videoEl;
  moveVideoToGamePreview();

  await new Promise((r) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(r);
    });
  });

  currentGame = createBlockBreakerGame(gameCanvas, {
    video: videoEl,
    mode: gameMode,
    onFinish(result) {
      handleGameFinish(result);
    },
  });
  currentGame.start({ startPaused });
}

/**
 * @param {{ startPaused?: boolean }} [opts]
 */
async function startCleanGame(opts = {}) {
  const { startPaused = false } = opts;
  const gameCanvas = document.getElementById("game");
  const videoEl = document.getElementById("camera");
  const screenGame = document.getElementById("screen-game");
  if (!gameCanvas || !videoEl) return;

  screenGame?.classList.add("screen-game--no-preview");
  setPhase("game");
  if (currentGame) {
    currentGame.stop();
    currentGame = null;
  }
  video = videoEl;
  moveVideoToGamePreview();

  await new Promise((r) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(r);
    });
  });

  currentGame = createCleanGame(gameCanvas, {
    video: videoEl,
    mode: gameMode,
    runEndCountdown,
    onFinish(result) {
      handleGameFinish(result);
    },
  });

  // startPaused mantém compatibilidade com o fluxo 3-2-1 (a limpeza não precisa pausar).
  currentGame.start({ startPaused });
}

/**
 * @param {{ startPaused?: boolean }} [opts]
 */
async function startCollectGame(opts = {}) {
  const { startPaused = false } = opts;
  const gameCanvas = document.getElementById("game");
  const videoEl = document.getElementById("camera");
  const screenGame = document.getElementById("screen-game");
  if (!gameCanvas || !videoEl) return;

  screenGame?.classList.add("screen-game--no-preview");
  setPhase("game");
  if (currentGame) {
    currentGame.stop();
    currentGame = null;
  }
  video = videoEl;
  moveVideoToGamePreview();

  await new Promise((r) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(r);
    });
  });

  currentGame = createCollectGame(gameCanvas, {
    video: videoEl,
    mode: gameMode,
    runEndCountdown,
    onFinish(result) {
      handleGameFinish(result);
    },
  });

  currentGame.start({ startPaused });
}

/**
 * @param {{ startPaused?: boolean }} [opts]
 */
async function goToGame(opts = {}) {
  const { startPaused = false } = opts;
  // Garante que não fica música "presa" ao trocar de minigame.
  try {
    stopBgMusicSmooth({ fadeMs: 500 });
  } catch {
    /* ignore */
  }
  switch (selectedGameId) {
    case "sprint100m":
      await startSprintGame({ startPaused });
      break;
    case "blockBreaker":
      await startBlockBreakerGame({ startPaused });
      break;
    case "cleanScreen":
      await startCleanGame({ startPaused });
      break;
    case "collect":
      await startCollectGame({ startPaused });
      break;
    default:
      await startSprintGame({ startPaused });
      break;
  }
}

/**
 * @param {string} msg
 * @param {{ show?: boolean }} [opts]
 */
function setLoadingStatus(msg, opts = {}) {
  const { show = false } = opts;
  const screen = document.getElementById("screen-loading");
  const el = document.getElementById("loading-status");
  if (screen) screen.classList.toggle("screen-loading--show-status", Boolean(show));
  if (el) el.textContent = msg;
}

async function boot() {
  const homeStatus = document.getElementById("home-status");
  const btnModeSingle = document.getElementById("btn-mode-single");
  const btnModeMulti = document.getElementById("btn-mode-multi");
  const videoEl = document.getElementById("camera");

  if (!videoEl) {
    setLoadingStatus(t("loading.error.noCameraDom"), { show: true });
    stopLoadingTips();
    return;
  }

  video = videoEl;
  setPhase("loading");
  if (btnModeSingle) btnModeSingle.disabled = true;
  if (btnModeMulti) btnModeMulti.disabled = true;

  cameraAvailable = false;

  // A câmera só deve ser solicitada quando entrar em calibração (detecção) ou no minigame.
  // Aqui apenas verificamos se o contexto é válido (HTTPS/localhost) e carregamos o modelo.
  if (!isCameraContextOk()) {
    setLoadingStatus(
      t("loading.error.httpsNeeded"),
      { show: true },
    );
  }

  // Mantemos o loading “limpo”: o carrossel de dicas é a UI principal.
  // Mensagens de status só aparecem em situações especiais (erro / instrução).
  setLoadingStatus("", { show: false });

  try {
    await initPoseBackend();
  } catch {
    setLoadingStatus(t("loading.error.modelFail"), { show: true });
    stopLoadingTips();
    return;
  }

  if (homeStatus) {
    homeStatus.textContent = t("home.status.ready");
  }
  // Final do loading: parar dicas, mostrar "Pronto", esperar 1s e só então transicionar.
  stopLoadingTips();
  document.getElementById("screen-loading")?.classList.add("screen-loading--ready");
  setLoadingStatus(t("loading.ready"), { show: true });
  await new Promise((r) => setTimeout(r, 3000));

  runUiScreenSwap("home", () => {
    setPhase("home");
    document.getElementById("screen-loading")?.classList.remove("screen-loading--ready");
    setLoadingStatus("", { show: false });
    if (btnModeSingle) btnModeSingle.disabled = false;
    if (btnModeMulti) btnModeMulti.disabled = false;
  });
}

function wireEvents() {
  const btnModeSingle = document.getElementById("btn-mode-single");
  const btnModeMulti = document.getElementById("btn-mode-multi");
  const overlayCountdown = document.getElementById("overlay-countdown");
  const overlayCountdownWrap = document.getElementById("overlay-countdown-wrap");
  const btnResultsRestart = document.getElementById("btn-results-restart");
  const btnResultsHome = document.getElementById("btn-results-home");
  const btnGlobalFullscreen = document.getElementById("btn-global-fullscreen");
  const btnGlobalOptions = document.getElementById("btn-global-options");
  const optionsModal = document.getElementById("options-modal");
  const optionsLang = /** @type {HTMLSelectElement|null} */ (
    document.getElementById("options-language")
  );
  const optionsBg = /** @type {HTMLInputElement|null} */ (
    document.getElementById("options-bg-volume")
  );
  const optionsSfx = /** @type {HTMLInputElement|null} */ (
    document.getElementById("options-sfx-volume")
  );
  const optionsBgValue = document.getElementById("options-bg-volume-value");
  const optionsSfxValue = document.getElementById("options-sfx-volume-value");

  function isFullscreen() {
    return Boolean(document.fullscreenElement);
  }

  const ICON_ENTER =
    `<svg class="btn-global-fullscreen__icon" width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
    `<path d="M9 5H6.5C5.67 5 5 5.67 5 6.5V9M15 5H17.5C18.33 5 19 5.67 19 6.5V9M9 19H6.5C5.67 19 5 18.33 5 17.5V15M15 19H17.5C18.33 19 19 18.33 19 17.5V15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const ICON_EXIT =
    `<svg class="btn-global-fullscreen__icon" width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
    `<path d="M8 6H6.5C5.67 6 5 6.67 5 7.5V9M16 6H17.5C18.33 6 19 6.67 19 7.5V9M8 18H6.5C5.67 18 5 17.33 5 16.5V15M16 18H17.5C18.33 18 19 17.33 19 16.5V15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

  function syncGlobalFullscreenButton() {
    if (!btnGlobalFullscreen) return;
    const on = isFullscreen();
    btnGlobalFullscreen.setAttribute(
      "aria-label",
      on ? t("global.fullscreen.exit") : t("global.fullscreen.enter"),
    );
    btnGlobalFullscreen.innerHTML = on ? ICON_EXIT : ICON_ENTER;
  }

  document.addEventListener("fullscreenchange", syncGlobalFullscreenButton);
  syncGlobalFullscreenButton();

  btnGlobalFullscreen?.addEventListener("click", async () => {
    try {
      if (isFullscreen()) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      /* ignore */
    } finally {
      syncGlobalFullscreenButton();
    }
  });

  function setOptionsOpen(open) {
    if (!optionsModal) return;
    optionsModal.hidden = !open;
    if (open) {
      // Garante que os controles reflitam o estado atual.
      syncOptionsFromPrefs();
      try {
        optionsLang?.focus?.();
      } catch {
        /* ignore */
      }
    }
  }

  function syncOptionsFromPrefs() {
    const p = getUserPrefs();
    if (optionsLang) optionsLang.value = p.language;
    if (optionsBg) optionsBg.value = String(Math.round((p.bgVolume ?? 0) * 100));
    if (optionsSfx) optionsSfx.value = String(Math.round((p.sfxVolume ?? 0) * 100));
    if (optionsBgValue) optionsBgValue.textContent = `${optionsBg?.value ?? "0"}%`;
    if (optionsSfxValue) optionsSfxValue.textContent = `${optionsSfx?.value ?? "0"}%`;
  }

  // Botão global abre o modal.
  btnGlobalOptions?.addEventListener("click", () => setOptionsOpen(true));

  // Fechar (backdrop e botões com data-options-close).
  optionsModal?.querySelectorAll?.("[data-options-close]")?.forEach((el) => {
    el.addEventListener("click", () => setOptionsOpen(false));
  });

  // Escape fecha.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (optionsModal && !optionsModal.hidden) setOptionsOpen(false);
  });

  optionsLang?.addEventListener("change", () => {
    setLanguage(optionsLang.value);
  });

  optionsBg?.addEventListener("input", () => {
    const pct = Number.parseInt(optionsBg.value, 10);
    const v = Number.isFinite(pct) ? pct / 100 : 0;
    setBgVolume(v);
    if (optionsBgValue) optionsBgValue.textContent = `${optionsBg.value}%`;
  });

  optionsSfx?.addEventListener("input", () => {
    const pct = Number.parseInt(optionsSfx.value, 10);
    const v = Number.isFinite(pct) ? pct / 100 : 0;
    setSfxVolume(v);
    if (optionsSfxValue) optionsSfxValue.textContent = `${optionsSfx.value}%`;
  });

  // Mantém UI do modal em sync se prefs mudarem por outros meios.
  subscribeUserPrefs(() => {
    syncOptionsFromPrefs();
  });

  btnModeSingle?.addEventListener("click", () => {
    runUiScreenSwap("mode-select", () => enterModeSelect("single"));
  });

  btnModeMulti?.addEventListener("click", () => {
    runUiScreenSwap("mode-select", () => enterModeSelect("multi"));
  });

  document.getElementById("btn-mode-quick")?.addEventListener("click", () => {
    runUiScreenSwap("quick-play", () => enterQuickPlay());
  });

  document.getElementById("btn-mode-minigames")?.addEventListener("click", () => {
    runUiScreenSwap("game-select", () => enterGameSelect());
  });

  document.getElementById("btn-home-debug")?.addEventListener("click", () => {
    if (!isLocalDebugAllowed()) return;
    enterDebugDetection();
  });

  document.getElementById("btn-home-ranking")?.addEventListener("click", () => {
    runUiScreenSwap("ranking", () => enterRanking());
  });

  wireRankingScreen({
    onBackFromList: () => {
      runUiScreenSwap("home", () => setPhase("home"));
    },
  });

  const debugScoreSlider = /** @type {HTMLInputElement|null} */ (
    document.getElementById("debug-detection-score")
  );
  debugScoreSlider?.addEventListener("input", () => {
    const raw = Number.parseInt(debugScoreSlider.value, 10);
    const pct = Number.isFinite(raw) ? raw : 0;
    debugScoreThresholdRef.value = Math.max(0, Math.min(1, pct / 100));
    debugScoreSlider.setAttribute("aria-valuenow", String(pct));
    const out = document.getElementById("debug-detection-score-value");
    if (out) out.textContent = debugScoreThresholdRef.value.toFixed(2);
  });

  document.getElementById("debug-blockbreaker-hand-sprites")?.addEventListener("change", (e) => {
    const t = /** @type {HTMLInputElement|null} */ (e.target);
    if (t) setBlockBreakerHandSpritesEnabled(t.checked);
  });

  document.getElementById("btn-mode-select-back")?.addEventListener("click", () => {
    runUiScreenSwap("home", () => setPhase("home"));
  });

  document.getElementById("btn-quick-play-back")?.addEventListener("click", () => {
    runUiScreenSwap("mode-select", () => setPhase("mode-select"));
  });

  document.getElementById("btn-quick-play-start")?.addEventListener("click", () => {
    const bestOf = getQuickPlayBestOfFromUI();
    const pool = getActiveGameIdsFromDom();
    quickPlayReset(bestOf, pool);
    const first = pickNextGameId(pool, null);
    quickPlay.lastGameId = first;
    selectedGameId = first;
    hideResultsPanel();
    runScreenTransition(() => enterReadyArena(gameMode));
  });

  // Sprint 100m: atualmente desabilitado na UI (sem clique).
  // Mantemos o handler defensivo caso o botão volte a ser habilitado futuramente.
  document.getElementById("btn-pick-sprint")?.addEventListener("click", (e) => {
    const btn = /** @type {HTMLButtonElement|null} */ (e.currentTarget);
    if (btn?.disabled) return;
    selectedGameId = "sprint100m";
    runScreenTransition(() => enterReadyArena(gameMode));
  });

  document.getElementById("btn-pick-blocks")?.addEventListener("click", () => {
    selectedGameId = "blockBreaker";
    runScreenTransition(() => enterReadyArena(gameMode));
  });

  document.getElementById("btn-pick-clean")?.addEventListener("click", () => {
    selectedGameId = "cleanScreen";
    runScreenTransition(() => enterReadyArena(gameMode));
  });

  document.getElementById("btn-pick-collect")?.addEventListener("click", () => {
    selectedGameId = "collect";
    runScreenTransition(() => enterReadyArena(gameMode));
  });

  document.getElementById("btn-game-select-back")?.addEventListener("click", () => {
    runUiScreenSwap("mode-select", () => setPhase("mode-select"));
  });

  // Carrossel de seleção de minigames
  const gameSelectScreen = document.getElementById("screen-game-select");
  const carouselViewport = gameSelectScreen?.querySelector("[data-game-carousel-viewport]");
  const navPrev = gameSelectScreen?.querySelector(".game-carousel__nav--prev");
  const navNext = gameSelectScreen?.querySelector(".game-carousel__nav--next");
  const btnConfirm = document.getElementById("btn-game-select-confirm");

  navPrev?.addEventListener("click", () => {
    if (!gameCarousel?.items?.length) ensureGameCarousel();
    if (!gameCarousel) return;
    carouselSelectIndex(gameCarousel.index - 1);
  });

  navNext?.addEventListener("click", () => {
    if (!gameCarousel?.items?.length) ensureGameCarousel();
    if (!gameCarousel) return;
    carouselSelectIndex(gameCarousel.index + 1);
  });

  gameSelectScreen?.addEventListener("click", (e) => {
    const t = /** @type {HTMLElement|null} */ (e.target instanceof HTMLElement ? e.target : null);
    const btn = t?.closest?.('button[data-game-id]');
    if (!btn) return;
    const el = /** @type {HTMLButtonElement} */ (btn);
    if (el.disabled) return;
    if (!el.classList.contains("game-card--active")) return;
    if (!gameCarousel?.items?.length) ensureGameCarousel();
    if (!gameCarousel) return;
    const idx = gameCarousel.items.indexOf(el);
    if (idx >= 0) {
      carouselSelectIndex(idx);
      if (window.matchMedia("(max-width: 720px)").matches) {
        runScreenTransition(() => enterReadyArena(gameMode));
      }
    }
  });

  btnConfirm?.addEventListener("click", () => {
    if (!gameCarousel?.items?.length) ensureGameCarousel();
    if (gameCarousel?.items?.length) {
      const btn = gameCarousel.items[gameCarousel.index];
      selectedGameId = String(btn.getAttribute("data-game-id") || selectedGameId);
    }
    runScreenTransition(() => enterReadyArena(gameMode));
  });

  // Swipe/drag no viewport (mobile/desktop)
  if (carouselViewport) {
    let down = false;
    let startX = 0;
    let startY = 0;
    let moved = false;
    let pointerId = 0;

    function onDown(ev) {
      if (!(ev instanceof PointerEvent)) return;
      down = true;
      moved = false;
      pointerId = ev.pointerId;
      startX = ev.clientX;
      startY = ev.clientY;
      try {
        carouselViewport.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }
    }

    function onMove(ev) {
      if (!(ev instanceof PointerEvent) || !down) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        moved = true;
      }
      // Se estiver arrastando horizontal, evita scroll vertical do browser
      if (Math.abs(dx) > Math.abs(dy)) {
        ev.preventDefault();
      }
    }

    function onUp(ev) {
      if (!(ev instanceof PointerEvent) || !down) return;
      down = false;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const TH = 35;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) >= TH) {
        if (!gameCarousel?.items?.length) ensureGameCarousel();
        if (!gameCarousel) return;
        if (dx < 0) carouselSelectIndex(gameCarousel.index + 1);
        else carouselSelectIndex(gameCarousel.index - 1);
      }
      try {
        carouselViewport.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
    }

    carouselViewport.addEventListener("pointerdown", onDown);
    carouselViewport.addEventListener("pointermove", onMove, { passive: false });
    carouselViewport.addEventListener("pointerup", onUp);
    carouselViewport.addEventListener("pointercancel", onUp);
  }

  document.getElementById("btn-detection-back")?.addEventListener("click", () => {
    document
      .getElementById("screen-detection")
      ?.classList.remove("screen-detection--countdown-ui-hidden");
    if (readyArena) {
      try {
        readyArena.stop();
      } catch {
        /* ignore */
      }
      readyArena = null;
    }
    readyCountdownLock = false;
    const backTarget = detectionReturnPhase;
    detectionReturnPhase = "game-select";
    stopCameraSession();
    setPhase(backTarget);
  });

  const btnRecordSave = document.getElementById("btn-record-save");
  const inputRecordName = /** @type {HTMLInputElement|null} */ (
    document.getElementById("input-record-name")
  );

  /**
   * @param {{ animate?: boolean }} [opts]
   */
  function commitPendingHighScore(opts = {}) {
    if (!pendingHighScore) return;
    const animate = opts.animate !== false;
    const rawName = inputRecordName?.value ?? "";
    const name = sanitizeName(rawName);
    const { rank } = saveScore(pendingHighScore.gameId, {
      name,
      score: pendingHighScore.score,
      timeSec: pendingHighScore.timeSec,
    });
    pendingHighScore = null;

    const panel = document.getElementById("panel-results");
    const actions = panel?.querySelector(".panel-results__actions");
    const form = document.getElementById("panel-results-form");
    const saved = document.getElementById("panel-results-saved");
    const savedText = document.getElementById("panel-results-saved-text");

    if (!animate) {
      // Fluxo alternativo (restart/home): painel vai fechar; apenas resetamos estado.
      if (form) form.hidden = true;
      if (saved) saved.hidden = false;
      if (actions instanceof HTMLElement) actions.hidden = false;
      return;
    }

    if (rank > 0) setMedalRank(rank);

    if (form) form.hidden = true;
    if (saved) {
      saved.hidden = false;
      if (savedText) {
        savedText.textContent = t("results.savedAs").replace("{name}", name);
      }
    }
    if (actions instanceof HTMLElement) {
      actions.hidden = false;
      actions.classList.remove("panel-results__actions--fade-in");
      void actions.offsetHeight;
      actions.classList.add("panel-results__actions--fade-in");
    }
  }

  btnRecordSave?.addEventListener("click", () => {
    commitPendingHighScore();
  });

  inputRecordName?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      commitPendingHighScore();
    }
  });

  btnResultsRestart?.addEventListener("click", async () => {
    if (!overlayCountdown) return;
    if (pendingHighScore) commitPendingHighScore({ animate: false });
    hideResultsPanel();
    setGlobalFullscreenLocked(true);
    if (currentGame) {
      currentGame.stop();
      currentGame = null;
    }
    await goToGame({ startPaused: true });
    await maybeRunBlockBreakerTutorial();
    await runStartCountdown(overlayCountdown, {
      wrapEl: overlayCountdownWrap ?? undefined,
    });
    if (selectedGameId === "blockBreaker") {
      try {
        startBgMusicSmooth(BLOCKBREAKER_BG_MUSIC_URL, { fadeMs: 1000, baseVolume: 1 });
      } catch {
        /* ignore */
      }
    }
    currentGame?.resumeGameplay?.();
  });

  btnResultsHome?.addEventListener("click", () => {
    if (pendingHighScore) commitPendingHighScore({ animate: false });
    if (currentGame) {
      currentGame.stop();
      currentGame = null;
    }
    hideResultsPanel();
    document.getElementById("screen-game")?.classList.remove("screen-game--no-preview");
    moveVideoToCalibration();
    stopCameraSession();
    setPhase("home");
  });
}

async function init() {
  const root = document.getElementById("app-root");
  if (!root) {
    console.error("#app-root não encontrado");
    return;
  }
  try {
    await mountScreens(root);
    // i18n: aplica nas telas carregadas + mantém sincronizado com prefs.
    bindI18nAutoApply();
    // áudio: sincroniza volumes (SFX/BG) com prefs.
    bindAudioPrefsAutoSync();
    // Ao sair do splash, faz o loading “entrar” com a mesma animação dos menus.
    // O body já começa em phase-loading no index.html; aqui só disparamos a animação de entrada.
    document.body.classList.add("ui-transition-enter");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.classList.remove("ui-transition-enter");
      });
    });
    wireEvents();
    await boot();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    root.innerHTML =
      "<p style=\"padding:24px;font-family:system-ui;max-width:42rem;line-height:1.5\">" +
      "<strong>Não foi possível iniciar a aplicação.</strong><br/><br/>" +
      "Se estiver a usar servidor HTTP local, confirme que corre na mesma pasta do projeto " +
      "(não use <code>file://</code>).<br/><br/>" +
      "<small style=\"opacity:0.85\">" +
      String(msg).replace(/</g, "&lt;") +
      "</small></p>";
    console.error(e);
  }
}

void init();
