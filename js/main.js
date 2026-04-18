import { mountScreens } from "./app/mountScreens.js";
import {
  setupCamera,
  prefersCameraUserGesture,
  isCameraContextOk,
} from "./core/camera.js";
import { CAMERA_FIT_COVER, getCameraFitMode } from "./core/cameraDisplayPrefs.js";
import { initPoseBackend, startInferenceLoop } from "./core/poseService.js";
import { createReadyArenaScreen } from "./ui/readyArenaScreen.js";
import { createSprintGame } from "./games/sprint100m/sprintGame.js";
import { createBlockBreakerGame } from "./games/blockBreaker/blockBreakerGame.js";
import { createCleanGame } from "./games/cleanScreen/cleanGame.js";
import { createCollectGame } from "./games/collect/collectGame.js";
import { runEndCountdown, runStartCountdown } from "./ui/countdown.js";
import { runVictorySequence } from "./ui/victorySequence.js";

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
const LOADING_TIPS = [
  "Dica: use um lugar bem iluminado para melhorar a detecção.",
  "Dica: deixe o corpo inteiro visível na câmera.",
  "Dica: evite luz forte atrás de você (contra-luz).",
  "Dica: mantenha o celular firme (ou apoie em um suporte).",
  "Dica: para 2 jogadores, fiquem um à esquerda e outro à direita.",
];

/** @type {{ items: HTMLButtonElement[]; index: number; viewport: HTMLElement|null; track: HTMLElement|null; navPrev: HTMLButtonElement|null; navNext: HTMLButtonElement|null; confirmBtn: HTMLButtonElement|null } | null} */
let gameCarousel = null;

function stopLoadingTips() {
  if (loadingTipsTimer) window.clearInterval(loadingTipsTimer);
  loadingTipsTimer = 0;
}

function startLoadingTips() {
  const tipEl = document.getElementById("loading-tip");
  if (!tipEl) return;
  stopLoadingTips();
  loadingTipsIdx = 0;
  tipEl.textContent = LOADING_TIPS[0] ?? "";

  loadingTipsTimer = window.setInterval(() => {
    const el = document.getElementById("loading-tip");
    if (!el) {
      stopLoadingTips();
      return;
    }
    el.classList.add("loading-tip--fade");
    window.setTimeout(() => {
      loadingTipsIdx = (loadingTipsIdx + 1) % LOADING_TIPS.length;
      el.textContent = LOADING_TIPS[loadingTipsIdx] ?? "";
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
  };
  root.classList.add(map[phase] || "phase-home");
}

/**
 * Após escolher 1 ou 2 jogadores na home — seleção de modo.
 * @param {"single"|"multi"} mode
 */
function enterModeSelect(mode) {
  gameMode = mode;
  const playersBadge = document.getElementById("mode-select-players");
  if (playersBadge) {
    playersBadge.textContent = mode === "single" ? "1 Player" : "2 Players";
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

/**
 * Configuração do Quick Play (best-of).
 */
function enterQuickPlay() {
  const playersBadge = document.getElementById("quick-play-players");
  if (playersBadge) {
    playersBadge.textContent = gameMode === "single" ? "1 Player" : "2 Players";
  }
  setPhase("quick-play");
}

/**
 * Seleção de minigame (tela atual).
 */
function enterGameSelect() {
  const playersBadge = document.getElementById("game-select-players");
  if (playersBadge) {
    playersBadge.textContent = gameMode === "single" ? "1 Player" : "2 Players";
  }
  setPhase("game-select");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ensureGameCarousel();
    });
  });
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
  gameCarousel.index = i;
  const btn = gameCarousel.items[i];
  selectedGameId = String(btn.getAttribute("data-game-id") || selectedGameId);
  carouselUpdateLayout();
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
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.textContent = body;
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
function formatResultsText(result) {
  if (result.gameId === "collect") {
    const s1 = result.scoreP1 ?? 0;
    const s2 = result.scoreP2 ?? 0;
    if (result.mode === "single") {
      return `Pontuação: ${s1} pontos\n(Maçã +5, manga +10, melancia +30, bomba -20)`;
    }
    const w = result.winner;
    const winLine = w === 1 || w === 2 ? `Vencedor: P${w}\n` : "Empate\n";
    return `${winLine}P1: ${s1} pontos\nP2: ${s2} pontos`;
  }

  if (result.gameId === "cleanScreen") {
    const s1 = result.scoreP1 ?? 0;
    const s2 = result.scoreP2 ?? 0;
    if (result.mode === "single") {
      return `Pontuação: ${s1} pontos\n(Limpe manchas fazendo círculos com as mãos; +5 por círculo)`;
    }
    const w = result.winner;
    const winLine = w === 1 || w === 2 ? `Vencedor: P${w}\n` : "Empate\n";
    return `${winLine}P1: ${s1} pontos\nP2: ${s2} pontos`;
  }

  if (result.gameId === "blockBreaker") {
    const s1 = result.scoreP1 ?? 0;
    const s2 = result.scoreP2 ?? 0;
    const total = result.scoreTotal ?? s1 + s2;
    if (result.mode === "single") {
      return `Pontuação: ${s1} pontos\n(8–10 caixas com PV 5–8; golpe rápido: até 3 de dano; +5 pts por PV retirado)`;
    }
    const w = result.winner;
    const winLine =
      w === 1 || w === 2 ? `Vencedor: P${w}\n` : "";
    return `${winLine}P1: ${s1} pontos\nP2: ${s2} pontos\nTotal: ${total} pontos\n(Cada um destrói as caixas do seu lado; 8–10 caixas, PV 5–8; golpe rápido: até 3 de dano; +5 por PV)`;
  }

  const { winner, timeP1, timeP2, mode } = result;
  if (mode === "single") {
    return `Tempo: ${timeP1.toFixed(2)} s\nMeta: 100 m`;
  }
  const lines = [
    `Vencedor: P${winner}`,
    `P1: ${timeP1.toFixed(2)} s`,
    `P2: ${timeP2.toFixed(2)} s`,
  ];
  return lines.join("\n");
}

function showResultsPanel(result) {
  const resultsBody = document.getElementById("results-body");
  const resultsTitle = document.getElementById("results-title");
  const panelResults = document.getElementById("panel-results");
  if (resultsTitle) resultsTitle.textContent = "Resultado";
  if (resultsBody) resultsBody.textContent = formatResultsText(result);
  if (panelResults) panelResults.hidden = false;
  setGlobalFullscreenLocked(false);

  // Alguns navegadores podem pausar o <video> em mudanças de UI/overlay.
  // Garantimos que a câmera continue tocando enquanto o painel aparece.
  const videoEl = video ?? document.getElementById("camera");
  void videoEl?.play?.().catch(() => {});
}

/** Confetes + título + coroa; depois o painel de resultados. */
function handleGameFinish(result) {
  const videoEl = video ?? document.getElementById("camera");
  if (!quickPlay.active) {
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
            await runStartCountdown(overlayCountdown, { wrapEl: overlayCountdownWrap ?? undefined });
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
}

/** Texto fixo no painel de calibração antes da deteção estável. */
const DETECTION_STATUS_BASE =
  "Mostre as mãos para detetar.";

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
  if (!videoEl || !overlayDetection) return;

  gameMode = mode;
  screenDetection?.classList.remove("screen-detection--countdown-ui-hidden");
  moveVideoToCalibration();
  setPhase("detection");

  if (readyArena) {
    try {
      readyArena.stop();
    } catch {
      /* ignore */
    }
    readyArena = null;
  }

  if (statusText) {
    statusText.textContent = DETECTION_STATUS_BASE;
  }

  readyArena = createReadyArenaScreen({
    video: videoEl,
    overlayCanvas: overlayDetection,
    gameMode: mode,
    statusTextEl: statusText ?? undefined,
    statusBaseText: DETECTION_STATUS_BASE,
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
          await runStartCountdown(overlayCountdown, {
            wrapEl: wrapEl ?? undefined,
          });
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
  const btnCameraStart = document.getElementById("btn-camera-start");
  const videoEl = document.getElementById("camera");

  if (!videoEl) {
    setLoadingStatus("Erro: câmera não encontrada no DOM.", { show: true });
    stopLoadingTips();
    return;
  }

  video = videoEl;
  setPhase("loading");
  if (btnModeSingle) btnModeSingle.disabled = true;
  if (btnModeMulti) btnModeMulti.disabled = true;

  cameraAvailable = false;

  if (!isCameraContextOk()) {
    setLoadingStatus(
      "A câmera precisa de HTTPS ou localhost. No telemóvel, abra o mesmo site com https:// ou use um túnel (ex.: ngrok), não http:// só pelo IP.",
      { show: true },
    );
    stopLoadingTips();
  } else if (prefersCameraUserGesture()) {
    if (btnCameraStart) {
      setLoadingStatus("Toque em «Permitir câmera» para o navegador pedir acesso à câmera frontal.");
      btnCameraStart.hidden = false;
      await new Promise((resolve) => {
        async function onCameraTap() {
          btnCameraStart.disabled = true;
          setLoadingStatus("A abrir a câmera…");
          try {
            await setupCamera(videoEl);
            cameraAvailable = true;
            btnCameraStart.hidden = true;
            btnCameraStart.removeEventListener("click", onCameraTap);
            resolve();
          } catch {
            cameraAvailable = false;
            setLoadingStatus(
              "Não foi possível usar a câmera. Verifique as permissões nas definições do navegador e toque de novo.",
              { show: true },
            );
            stopLoadingTips();
            btnCameraStart.disabled = false;
          }
        }
        btnCameraStart.addEventListener("click", onCameraTap);
      });
    } else {
      try {
        await setupCamera(videoEl);
        cameraAvailable = true;
      } catch {
        /* ignore */
      }
    }
  } else {
    setLoadingStatus("Abrindo câmera…");
    try {
      await setupCamera(videoEl);
      cameraAvailable = true;
    } catch {
      /* Sem câmera: segue o fluxo para permitir testar telas no preview embutido (ex.: Cursor). */
    }
  }

  // Mantemos o loading “limpo”: o carrossel de dicas é a UI principal.
  // Mensagens de status só aparecem em situações especiais (erro / instrução).
  setLoadingStatus("", { show: false });

  try {
    await initPoseBackend();
  } catch {
    setLoadingStatus("Falha ao carregar o modelo. Recarregue a página.", { show: true });
    stopLoadingTips();
    return;
  }

  startInferenceLoop(videoEl);

  if (homeStatus) {
    homeStatus.textContent = cameraAvailable
      ? "Escolha um ou dois jogadores."
      : "Preview sem câmera: você pode testar o fluxo das telas. Para jogar de verdade, abra em localhost ou HTTPS e permita a câmera.";
  }
  // Final do loading: parar dicas, mostrar "Pronto", esperar 1s e só então transicionar.
  stopLoadingTips();
  document.getElementById("screen-loading")?.classList.add("screen-loading--ready");
  setLoadingStatus("Pronto!", { show: true });
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
    btnGlobalFullscreen.setAttribute("aria-label", on ? "Sair da tela cheia" : "Tela cheia");
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
    if (idx >= 0) carouselSelectIndex(idx);
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
    setPhase("game-select");
  });

  btnResultsRestart?.addEventListener("click", async () => {
    if (!overlayCountdown) return;
    hideResultsPanel();
    setGlobalFullscreenLocked(true);
    if (currentGame) {
      currentGame.stop();
      currentGame = null;
    }
    await goToGame({ startPaused: true });
    await runStartCountdown(overlayCountdown, {
      wrapEl: overlayCountdownWrap ?? undefined,
    });
    currentGame?.resumeGameplay?.();
  });

  btnResultsHome?.addEventListener("click", () => {
    if (currentGame) {
      currentGame.stop();
      currentGame = null;
    }
    hideResultsPanel();
    document.getElementById("screen-game")?.classList.remove("screen-game--no-preview");
    moveVideoToCalibration();
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
