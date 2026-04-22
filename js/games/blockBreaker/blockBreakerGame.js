import { getBlockBreakerHandSpritesEnabled } from "../../core/blockBreakerDisplayPrefs.js";
import { getPlayerPoses, sortPosesByMirroredScreenX } from "../../core/poseService.js";
import { getCameraFitMode } from "../../core/cameraDisplayPrefs.js";
import { playSfx } from "../../core/audioMixer.js";
import {
  getVideoFitRect,
  getVideoLayoutRect,
  mapVideoKpToCanvas as mapKpVideoToCanvas,
} from "../../core/videoFit.js";

/** Número de caixas (solo = total; duo = por jogador). Sempre 4×2. */
const BLOCK_COUNT = 8;

/** Texto flutuante por intensidade do golpe (damage 1–3). */
const HIT_POPUP_MS = 620;
const SCREEN_SHAKE_MS = 110;
const DEBRIS_MS = 850;
const DEBRIS_N_MIN = 10;
const DEBRIS_N_MAX = 18;
const DEBRIS_GRAVITY = 2100;

/**
 * @param {number} damage
 * @returns {{ text: string; color: string }}
 */
function hitFeedbackForDamage(damage) {
  if (damage >= 3) return { text: "DEUS!", color: "#1A237E", outline: "#FFFFFF" };
  if (damage >= 2) return { text: "ÓTIMO!", color: "#2ECC71", outline: "#000000" };
  return { text: "BOM!", color: "#FFD700", outline: "#000000" };
}
const BLOCK_HP_MIN = 5;
const BLOCK_HP_MAX = 8;
const KP_MIN_SCORE = 0.28;
/** Limiar (mais permissivo) para apenas DESENHAR o sprite da mão; não afeta lógica de hit. */
const KP_DRAW_SCORE = 0.18;
/** Tempo após a última detecção válida em que o sprite continua a ser desenhado na última posição. */
const HAND_STICKY_MS = 300;
/** Fator de suavização exponencial aplicado à posição do sprite (0..1); maior = responde mais rápido. */
const HAND_SMOOTH_ALPHA = 0.45;
/** Tempo (ms) para o sprite aparecer gradualmente (fade-in). */
const HAND_FADE_IN_MS = 120;
/** Tempo (ms) para o sprite desaparecer gradualmente quando a detecção é perdida. */
const HAND_FADE_OUT_MS = 180;
/** Evita vários golpes no mesmo bloco no mesmo swing. */
const BLOCK_HIT_INVUL_MS = 260;
/** Cooldown por punho após acertar (evita vários hits no mesmo gesto). */
const WRIST_HIT_COOLDOWN_MS = 260;
/** Intervalo mínimo entre amostras de posição do punho (pose ~15 Hz; evita velocidade ~0 a 60 FPS). */
const WRIST_SAMPLE_MIN_MS = 52;
/** Velocidade mínima (px/s no espaço do vídeo) para contar golpe; escalada por resolução. */
const SPEED_HIT_MIN_RATIO = 0.72;
const SPEED_DMG_2_RATIO = 1.15;
const SPEED_DMG_3_RATIO = 1.65;
/** Gravidade um pouco mais baixa = queda mais “flutuante”, estilo gelatina. */
const GRAVITY_PX = 2380;
const FLOOR_PAD = 20;
const HIT_IMPULSE_Y = -455;
const HIT_FLASH_MS = 280;
/** Valor base de cada bloco ao destruir, no início da partida. */
const BLOCK_BASE_VALUE = 20;
/** Piso do decay do valor do bloco. */
const BLOCK_MIN_VALUE = 5;
/** Duração do lerp linear de `BLOCK_BASE_VALUE` → `BLOCK_MIN_VALUE` (ms). */
const BLOCK_DECAY_DURATION_MS = 60000;
/** Após este tempo sem destruir nada, o combo do jogador reseta. */
const COMBO_IDLE_RESET_MS = 4000;
/** Bônus ao limpar uma cor tendo tocado na outra. */
const COLOR_CLEAR_BONUS = 10;
/** Bônus ao limpar uma cor sem ter destruído nenhum bloco da outra. */
const COLOR_PERFECT_BONUS = 50;
/** Tempo de shake do "game juice" do bônus perfeito. */
const PERFECT_SHAKE_MS = 420;
/** Parte em slow-mo fixo do bônus perfeito. */
const PERFECT_SLOWMO_HOLD_MS = 260;
/** Interpolação do slow-mo de volta a 1× depois do hold. */
const PERFECT_SLOWMO_RAMP_MS = 240;
/** Duração do flash branco no bônus perfeito. */
const PERFECT_FLASH_MS = 320;
/** Duração do banner "COR PERFEITA!". */
const PERFECT_BANNER_MS = 1400;
/** Duração do anel em expansão do bônus perfeito. */
const PERFECT_RING_MS = 520;
/** Duração total da sequência de vitória/fim (antes de chamar `onFinish`). */
const END_SEQUENCE_MS = 2200;
/** Slow-mo inicial da sequência de vitória. */
const END_SLOWMO_HOLD_MS = 520;
/** Rampa de volta ao tempo normal após o slow-mo da sequência de fim. */
const END_SLOWMO_RAMP_MS = 420;
/** Shake inicial da sequência de vitória. */
const END_SHAKE_MS = 780;
/** Flash inicial da sequência de vitória. */
const END_FLASH_MS = 420;
/** Fração da altura do sprite acima do pivô do punho (alinhado a drawHandSprites). */
const HAND_SPRITE_ANCHOR_Y = 0.52;
/** Escala linear das caixas face ao encaixe compacto na grelha (2 ≈ o dobro do tamanho anterior). */
const BLOCK_LAYOUT_SIZE_MULT = 2;
/** Redução final do tamanho visual (0,75 = 25% mais pequenas). */
const BLOCK_LAYOUT_VISUAL_SCALE = 0.75;

const BLOCK_TINTS = [
  { name: "Azul", color: "#3b82f6" },
  { name: "Verde", color: "#22c55e" },
  { name: "Vermelho", color: "#ef4444" },
  { name: "Amarelo", color: "#facc15" },
  { name: "Laranja", color: "#fb923c" },
  { name: "Roxo", color: "#a855f7" },
];

/**
 * Par de cores por jogador (single usa apenas o índice 0).
 * P1 = Azul + Verde; P2 = Vermelho + Amarelo.
 * @type {readonly [readonly [string, string], readonly [string, string]]}
 */
const PLAYER_COLOR_PAIRS = [
  ["#3b82f6", "#22c55e"],
  ["#ef4444", "#facc15"],
];

function pickRandomTintColor() {
  const i = Math.floor(Math.random() * BLOCK_TINTS.length);
  return BLOCK_TINTS[i]?.color || "#94a3b8";
}

/**
 * Embaralha in-place (Fisher–Yates). Retorna o próprio array.
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

const HAND_L_URL = new URL("../../../assets/minigame-break/hand_l.png", import.meta.url).href;
const HAND_R_URL = new URL("../../../assets/minigame-break/hand_r.png", import.meta.url).href;

/** Sprite único de "gelatina" usado para todas as caixas, independente do HP. */
const GEL_SPRITE_URL = new URL("../../../assets/minigame-break/gel_image.png", import.meta.url).href;

/** Dois sons de “gelatina” no hit; alternam a cada golpe. */
const JELLY_HIT_AUDIO_URLS = [
  new URL(
    "../../../assets/audios/jelly_sound/freesound_community-jellybounce-45797.mp3",
    import.meta.url,
  ).href,
  new URL(
    "../../../assets/audios/jelly_sound/freesound_community-jelly-kick-85503.mp3",
    import.meta.url,
  ).href,
];
let jellyHitSoundIndex = 0;

function playJellyHitSound() {
  try {
    const href = JELLY_HIT_AUDIO_URLS[jellyHitSoundIndex % JELLY_HIT_AUDIO_URLS.length];
    jellyHitSoundIndex += 1;
    playSfx(href, { baseVolume: 0.62 });
  } catch {
    /* ignore */
  }
}

/** @type {HTMLImageElement|null} */
let handSpriteL = null;
/** @type {HTMLImageElement|null} */
let handSpriteR = null;
/** Sprite único da "gelatina" (substitui os 2 sprites por nível de dano). */
/** @type {HTMLImageElement|null} */
let gelSprite = null;
/** altura/largura do sprite da gelatina (atualizado ao carregar PNG). */
let boxSpriteAspectRatio = 1;

(function preloadHandSprites() {
  const l = new Image();
  const r = new Image();
  l.onload = () => {
    handSpriteL = l;
  };
  r.onload = () => {
    handSpriteR = r;
  };
  l.src = HAND_L_URL;
  r.src = HAND_R_URL;
})();

(function preloadGelSprite() {
  const img = new Image();
  img.onload = () => {
    gelSprite = img;
    if (img.naturalWidth > 0) {
      const ar = img.naturalHeight / img.naturalWidth;
      if (ar > 0.15 && ar < 6) boxSpriteAspectRatio = ar;
    }
  };
  img.src = GEL_SPRITE_URL;
})();

function getBoxSpriteAspectRatio() {
  if (gelSprite && gelSprite.complete && gelSprite.naturalWidth > 0) {
    return gelSprite.naturalHeight / gelSprite.naturalWidth;
  }
  if (boxSpriteAspectRatio > 0.15 && boxSpriteAspectRatio < 6) return boxSpriteAspectRatio;
  return 1;
}

/**
 * @param {import("@tensorflow-models/pose-detection").Keypoint[]} keypoints
 * @param {string} name
 */
function findKp(keypoints, name) {
  return keypoints.find((k) => k.name === name);
}

/**
 * @param {{ x: number; y: number; score?: number }} kp
 * @param {HTMLVideoElement} video
 * @param {HTMLCanvasElement} canvas
 * @param {boolean} mirror
 */
function mapKpToCanvas(kp, video, canvas, mirror) {
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  return mapKpVideoToCanvas(
    kp,
    canvas.width,
    canvas.height,
    vw,
    vh,
    mirror,
    getCameraFitMode(),
  );
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} [options]
 * @param {HTMLVideoElement} [options.video]
 * @param {HTMLCanvasElement} [options.previewOverlay]
 * @param {"single"|"multi"} [options.mode]
 * @param {(result: {
 *   gameId: "blockBreaker";
 *   mode: "single"|"multi";
 *   timeSec: number;
 *   timeP1: number;
 *   timeP2: number;
 *   winner: null | 1 | 2;
 *   scoreP1: number;
 *   scoreP2: number;
 *   scoreTotal: number;
 * }) => void} [options.onFinish]
 */
export function createBlockBreakerGame(canvas, options = {}) {
  const ctx = canvas.getContext("2d");
  const { onFinish, video, previewOverlay, mode = "multi" } = options;
  /** Enquanto true, desenha o jogo mas não avança física nem dano (contagem 3-2-1). */
  let gameplayPaused = false;
  const single = mode === "single";
  const pctx = previewOverlay ? previewOverlay.getContext("2d") : null;

  /**
   * @type {{
   *   x: number;
   *   y: number;
   *   w: number;
   *   h: number;
   *   vx: number;
   *   vy: number;
   *   hp: number;
   *   maxHp: number;
   *   destroyed: boolean;
   *   lastDamagedMs: number;
   *   hitFlashUntil: number;
   *   hitShakeUntil: number;
   *   owner: 0 | 1;
   *   tint: string;
   *   renderScaleX: number;
   *   renderScaleY: number;
   *   renderRot: number;
   * }[]}
   */
  let blocks = [];
  /** Contagem de caixas nesta partida (fixa após `start`, usada em `layoutBlocks`). */
  let blocksThisGameSingle = 8;
  let blocksPerPlayerDuo = 8;
  /** Duo: instante em que cada lado limpou todas as caixas (-1 = ainda não). */
  let ownerClearTime = [-1, -1];
  let finished = false;
  let startTime = 0;
  let lastT = 0;
  let rafId = 0;
  let lastPhysicsMs = 0;
  /** Margem extra no retângulo de hit (coordenadas do canvas), recalculada no layout. */
  let hitPad = 14;
  /** Só depois da primeira caixa tocar no chão (evita hits ao spawn à altura das mãos). */
  let blockDamageEnabled = false;
  /** Pontos por jogador (índice 0 = P1, 1 = P2). */
  let scores = [0, 0];
  /** Área do canvas onde o frame da câmara aparece (letterbox); jogo confinado aqui. */
  let videoContentRect = { x: 0, y: 0, w: 0, h: 0 };
  /** Histórico de posição do punho no vídeo: chave `${pIdx}-${side}` → { x, y, t }. */
  const wristPrev = new Map();
  /** Último instante em que este punho acertou (cooldown). */
  const wristLastHitMs = new Map();
  /**
   * Estado visual persistente dos sprites das mãos (posição suavizada em coords do canvas,
   * última detecção válida e alpha atual para fade in/out). Evita que o sprite "pisque"
   * quando a pose perde confiança por um frame ou dois.
   * @type {Map<string, { x: number; y: number; lastSeenMs: number; alpha: number; lastDrawMs: number }>}
   */
  const handSpriteState = new Map();

  /** @type {{ x: number; y: number; text: string; color: string; startMs: number; duration: number; big?: boolean }[]} */
  let hitPopups = [];
  /** `performance.now()` até quando aplica shake leve (tier 3). */
  let screenShakeUntil = 0;
  /**
   * Pedaços ao destruir a caixa (partículas geométricas).
   * @type {{ x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; color: string; startMs: number; duration: number; shape?: "tri"|"rect"|"square" }[]}
   */
  let debris = [];

  // Estado de pontuação/combo ---------------------------------------------
  /** Instante em que o dano aos blocos foi ativado (1º bloco a tocar no chão). */
  let gameStartMs = 0;
  /** Cor do último bloco destruído por jogador ("null" = combo resetado). */
  /** @type {(string|null)[]} */
  let comboColor = [null, null];
  /** Multiplicador atual do combo por jogador (1 quando inativo). */
  let comboMult = [1, 1];
  /** Instante da última destruição por jogador (para reset por inatividade). */
  let comboLastDestroyMs = [0, 0];
  /** Contagem de blocos destruídos por cor, por jogador. */
  /** @type {Record<string, number>[]} */
  let destroyedCountByColor = [
    /** @type {Record<string, number>} */ ({}),
    /** @type {Record<string, number>} */ ({}),
  ];
  /** Contagem fixa por cor após o layout, por jogador. */
  /** @type {Record<string, number>[]} */
  let totalByColor = [
    /** @type {Record<string, number>} */ ({}),
    /** @type {Record<string, number>} */ ({}),
  ];
  /** Cores já premiadas (evita dar bônus de cor limpa duas vezes). */
  /** @type {Set<string>[]} */
  let colorClearedAwarded = [new Set(), new Set()];

  // Game juice -----------------------------------------------------------
  /** Banner central "COR PERFEITA!" ativo. */
  /** @type {{ startMs: number; color: string; label: string }|null} */
  let perfectBanner = null;
  /** Flash branco full-canvas. */
  let flashStart = 0;
  let flashUntil = 0;
  /** Anel em expansão (bônus perfeito). */
  /** @type {{ startMs: number; cx: number; cy: number; color: string }|null} */
  let perfectRing = null;
  /** Escala atual do tempo (1 = normal, <1 = slow-mo). */
  let timeScale = 1;
  /** Momento em que o slow-mo foi disparado. */
  let slowmoStart = 0;
  /** Se > 0, indica que há um slow-mo ativo. */
  let slowmoActive = false;

  // Sequência de fim de partida --------------------------------------------
  /**
   * Se diferente de null, a partida está no "rematch" visual antes de chamar `onFinish`:
   * os blocos continuam em cena, dano fica desativado e um banner de vitória é exibido.
   * @type {{
   *   startMs: number;
   *   duration: number;
   *   label: string;
   *   sublabel: string;
   *   color: string;
   *   result: import("./types.js")|any;
   * }|null}
   */
  let endingSequence = null;
  /** Slow-mo dedicado do ending (independente do +50 perfeito). */
  let endingSlowmoActive = false;
  let endingSlowmoStart = 0;

  function syncVideoContentRect() {
    const cw = canvas.width;
    const ch = canvas.height;
    if (!video || video.videoWidth < 2 || video.videoHeight < 2) {
      videoContentRect = { x: 0, y: 0, w: cw, h: ch };
      return;
    }
    const r = getVideoLayoutRect(cw, ch, video.videoWidth, video.videoHeight, getCameraFitMode());
    videoContentRect = { x: r.x, y: r.y, w: r.w, h: r.h };
  }

  /** Poses alinhadas com as caixas: P1 = lado esquerdo do ecrã (espelho). */
  function getGamePoses() {
    const players = getPlayerPoses();
    if (single) return players.slice(0, 1);
    return sortPosesByMirroredScreenX(players, video, canvas.width, canvas.height).slice(
      0,
      2,
    );
  }

  function videoSpeedRef() {
    const vw = video?.videoWidth || 640;
    const vh = video?.videoHeight || 480;
    return Math.max(480, vw, vh);
  }

  /** Velocidade em relação ao frame anterior (só leitura; commit no fim do frame). */
  function getWristSpeedNoUpdate(kp, pIdx, side, nowMs) {
    const prev = wristPrev.get(`${pIdx}-${side}`);
    if (!prev) return 0;
    const dt = (nowMs - prev.t) / 1000;
    if (dt <= 0.001 || dt > 0.35) return 0;
    return Math.hypot(kp.x - prev.x, kp.y - prev.y) / dt;
  }

  function commitWristPrev(kp, pIdx, side, nowMs) {
    const key = `${pIdx}-${side}`;
    const prev = wristPrev.get(key);
    if (prev && nowMs - prev.t < WRIST_SAMPLE_MIN_MS) return;
    wristPrev.set(key, { x: kp.x, y: kp.y, t: nowMs });
  }

  /** Grava posição atual de todos os punhos visíveis (uma vez por frame, após hits). */
  function commitAllWristPrev(poses, nowMs) {
    for (let pIdx = 0; pIdx < poses.length; pIdx += 1) {
      const kps = poses[pIdx]?.keypoints;
      if (!kps) continue;
      const lw = findKp(kps, "left_wrist");
      const rw = findKp(kps, "right_wrist");
      if (lw && (lw.score ?? 0) >= KP_MIN_SCORE) commitWristPrev(lw, pIdx, "left", nowMs);
      if (rw && (rw.score ?? 0) >= KP_MIN_SCORE) commitWristPrev(rw, pIdx, "right", nowMs);
    }
  }

  /** Dano 1–3 conforme velocidade; 0 = demasiado lento. */
  function damageFromSpeed(speedPxPerSec) {
    const ref = videoSpeedRef();
    const sMin = ref * SPEED_HIT_MIN_RATIO;
    const s2 = ref * SPEED_DMG_2_RATIO;
    const s3 = ref * SPEED_DMG_3_RATIO;
    if (speedPxPerSec < sMin) return 0;
    if (speedPxPerSec < s2) return 1;
    if (speedPxPerSec < s3) return 2;
    return 3;
  }

  function randomBlockHp() {
    return BLOCK_HP_MIN + Math.floor(Math.random() * (BLOCK_HP_MAX - BLOCK_HP_MIN + 1));
  }

  /** Sempre 4 colunas × 2 filas (8 caixas por região). */
  function gridDimsForCount() {
    return { cols: 4, rows: 2 };
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    layoutBlocks();
    blockDamageEnabled = false;
  }

  /**
   * Coloca n blocos numa faixa horizontal [regionX, regionX+regionW] dentro do retângulo do vídeo `vcr`.
   */
  function layoutBlocksInRegion(n, owner, regionX, regionW, vcr) {
    const { cols, rows } = gridDimsForCount();
    const cwRef = vcr.w;
    const chRef = vcr.h;
    const gap = Math.max(8, Math.min(18, Math.round(Math.min(cwRef, chRef) * 0.014)));
    const topChrome = Math.min(118, chRef * 0.14);
    const maxH = Math.min(chRef - topChrome - chRef * 0.05, chRef * 0.52);
    const innerPad = 6;
    const maxW = Math.max(80, regionW - innerPad * 2);
    const ar = getBoxSpriteAspectRatio();

    let bw = (maxW - gap * (cols - 1)) / cols;
    let bh = bw * ar;
    let totalH = rows * bh + gap * (rows - 1);
    if (totalH > maxH) {
      bh = (maxH - gap * (rows - 1)) / rows;
      bw = bh / ar;
      const maxBw = (maxW - gap * (cols - 1)) / cols;
      if (bw > maxBw) {
        bw = maxBw;
        bh = bw * ar;
      }
    }

    const bwTarget = bw * BLOCK_LAYOUT_SIZE_MULT;
    const bhTarget = bwTarget * ar;
    const twTarget = cols * bwTarget + gap * (cols - 1);
    const thTarget = rows * bhTarget + gap * (rows - 1);
    const fit = Math.min(maxW / Math.max(twTarget, 1), maxH / Math.max(thTarget, 1), 1);
    bw = bwTarget * fit * BLOCK_LAYOUT_VISUAL_SCALE;
    bh = bhTarget * fit * BLOCK_LAYOUT_VISUAL_SCALE;

    const totalW = cols * bw + gap * (cols - 1);
    const totalH2 = rows * bh + gap * (rows - 1);
    const ox = regionX + innerPad + (regionW - innerPad * 2 - totalW) / 2;
    const oy =
      vcr.y +
      topChrome +
      (maxH - totalH2) * 0.72 +
      Math.min(cwRef, chRef) * 0.03;

    hitPad = Math.max(10, Math.min(32, Math.min(bw, bh) * 0.11));

    // Par determinístico de 2 cores para este jogador, com metade/metade e shuffle.
    const pair = PLAYER_COLOR_PAIRS[owner] || PLAYER_COLOR_PAIRS[0];
    const [colorA, colorB] = pair;
    const half = Math.floor(n / 2);
    /** @type {string[]} */
    const tintBag = [];
    for (let i = 0; i < half; i += 1) tintBag.push(colorA);
    for (let i = 0; i < n - half; i += 1) tintBag.push(colorB);
    shuffleArray(tintBag);

    // Popular `totalByColor[owner]` com base nas cores atribuídas.
    const ownerIdx = owner === 1 ? 1 : 0;
    totalByColor[ownerIdx] = {};
    for (const c of tintBag) {
      totalByColor[ownerIdx][c] = (totalByColor[ownerIdx][c] ?? 0) + 1;
    }

    for (let i = 0; i < n; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const mhp = randomBlockHp();
      const scaleX = randBetween(0.9, 1.08);
      const scaleY = randBetween(0.9, 1.12);
      const rot = randBetween(-0.12, 0.12); // ~ -7º..+7º
      blocks.push({
        x: ox + col * (bw + gap),
        y: oy + row * (bh + gap),
        w: bw,
        h: bh,
        vx: 0,
        vy: 0,
        hp: mhp,
        maxHp: mhp,
        destroyed: false,
        lastDamagedMs: 0,
        hitFlashUntil: 0,
        hitShakeUntil: 0,
        owner,
        tint: tintBag[i],
        renderScaleX: scaleX,
        renderScaleY: scaleY,
        renderRot: rot,
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleAmp: 0,
        squashX: 1,
        squashY: 1,
        squashVelX: 0,
        squashVelY: 0,
        lastHitMs: 0,
      });
    }
  }

  function layoutBlocks() {
    syncVideoContentRect();
    const v = videoContentRect;
    blocks = [];

    if (single) {
      const n = blocksThisGameSingle;
      layoutBlocksInRegion(n, 0, v.x, v.w, v);
      return;
    }

    const mid = v.x + v.w / 2;
    const stripe = Math.max(8, v.w * 0.012);
    const leftRegionW = Math.max(48, mid - stripe / 2 - v.x);
    const rightX = mid + stripe / 2;
    const rightRegionW = Math.max(48, v.x + v.w - rightX);
    layoutBlocksInRegion(blocksPerPlayerDuo, 0, v.x, leftRegionW, v);
    layoutBlocksInRegion(blocksPerPlayerDuo, 1, rightX, rightRegionW, v);
  }

  function resizePreviewOverlay() {
    if (!previewOverlay || !video || !pctx) return;
    const w = Math.round(video.clientWidth || 1);
    const h = Math.round(video.clientHeight || 1);
    if (w < 2 || h < 2) return;
    previewOverlay.width = w;
    previewOverlay.height = h;
  }

  function drawPreviewPlayerTags() {
    if (!pctx || !video || !previewOverlay) return;
    resizePreviewOverlay();
    pctx.clearRect(0, 0, previewOverlay.width, previewOverlay.height);
    let poses = getPlayerPoses();
    if (single) poses = poses.slice(0, 1);
    else
      poses = sortPosesByMirroredScreenX(
        poses,
        video,
        previewOverlay.width,
        previewOverlay.height,
      ).slice(0, 2);
    const mirror = true;
    const labels = ["P1", "P2"];
    const colors = ["#34d399", "#fb923c"];

    const pw = previewOverlay.width;
    const ph = previewOverlay.height;
    const vw = video.videoWidth || 1;
    const vh = video.videoHeight || 1;
    const fitMode = getCameraFitMode();
    poses.forEach((pose, i) => {
      const nose = findKp(pose.keypoints, "nose");
      if (!nose || nose.score < 0.2) return;
      const { x, y } = mapKpVideoToCanvas(nose, pw, ph, vw, vh, mirror, fitMode);
      const text = labels[i];
      pctx.font = "bold 14px system-ui,sans-serif";
      const tw = pctx.measureText(text).width + 8;
      pctx.fillStyle = "rgba(0,0,0,0.7)";
      pctx.strokeStyle = colors[i];
      pctx.lineWidth = 2;
      pctx.fillRect(x - tw / 2, y - 28, tw, 22);
      pctx.strokeRect(x - tw / 2, y - 28, tw, 22);
      pctx.fillStyle = "#fff";
      pctx.textAlign = "center";
      pctx.fillText(text, x, y - 12);
    });
  }

  /**
   * @param {number} px
   * @param {number} py
   */
  function pointInBlock(px, py, b) {
    return (
      !b.destroyed &&
      b.hp > 0 &&
      px >= b.x - hitPad &&
      px <= b.x + b.w + hitPad &&
      py >= b.y - hitPad &&
      py <= b.y + b.h + hitPad
    );
  }

  function resolveBlockOverlap(a, b) {
    if (!single && a.owner !== b.owner) return;
    const ax2 = a.x + a.w;
    const ay2 = a.y + a.h;
    const bx2 = b.x + b.w;
    const by2 = b.y + b.h;
    const hox = Math.min(ax2, bx2) - Math.max(a.x, b.x);
    const voy = Math.min(ay2, by2) - Math.max(a.y, b.y);
    if (hox <= 0 || voy <= 0) return;

    const acx = a.x + a.w / 2;
    const acy = a.y + a.h / 2;
    const bcx = b.x + b.w / 2;
    const bcy = b.y + b.h / 2;

    if (voy < hox) {
      if (acy < bcy) {
        a.y = b.y - a.h - 0.5;
        if (a.vy > 0) a.vy = 0;
      } else {
        b.y = a.y - b.h - 0.5;
        if (b.vy > 0) b.vy = 0;
      }
    } else {
      const push = hox / 2 + 0.5;
      if (acx < bcx) {
        a.x -= push;
        b.x += push;
      } else {
        a.x += push;
        b.x -= push;
      }
      a.vx *= 0.88;
      b.vx *= 0.88;
    }
  }

  /**
   * @param {number} dt
   */
  function stepPhysics(dt) {
    syncVideoContentRect();
    const v = videoContentRect;
    const floorY = v.y + v.h - FLOOR_PAD;
    const margin = 6;
    const leftX = v.x + margin;
    const rightX = v.x + v.w - margin;
    const mid = v.x + v.w / 2;
    const innerGap = Math.max(6, v.w * 0.01);

    for (const b of blocks) {
      if (b.destroyed) continue;
      b.vy += GRAVITY_PX * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= Math.max(0, 1 - 2.2 * dt);
      // Damping visual (gelatina) — decay lento para o balanço durar mais.
      if (typeof b.wobbleAmp === "number") {
        b.wobbleAmp *= Math.max(0, 1 - 1.1 * dt);
      }
      // Spring mais rígido + menos amortecimento = mais “borracha” e overshoot.
      if (typeof b.squashX === "number") {
        b.squashVelX = (b.squashVelX || 0) + (1 - b.squashX) * 118 * dt;
        b.squashVelX *= Math.max(0, 1 - 3.35 * dt);
        b.squashX += b.squashVelX * dt;
      }
      if (typeof b.squashY === "number") {
        b.squashVelY = (b.squashVelY || 0) + (1 - b.squashY) * 118 * dt;
        b.squashVelY *= Math.max(0, 1 - 3.35 * dt);
        b.squashY += b.squashVelY * dt;
      }
    }

    for (const b of blocks) {
      if (b.destroyed) continue;
      if (single) {
        b.x = Math.max(leftX, Math.min(b.x, rightX - b.w));
      } else if (b.owner === 0) {
        b.x = Math.max(leftX, Math.min(b.x, mid - innerGap - b.w));
      } else {
        b.x = Math.max(mid + innerGap, Math.min(b.x, rightX - b.w));
      }
    }

    for (const b of blocks) {
      if (b.destroyed) continue;
      if (b.y + b.h > floorY) {
        b.y = floorY - b.h;
        if (b.vy > 32) {
          // Gelatina: bounce alto + leve deslize lateral ao aterrar.
          const speed = b.vy;
          b.vy = -speed * 0.58;
          b.vx += (Math.random() - 0.5) * 175;
          b.wobbleAmp = Math.min(9.5, (b.wobbleAmp || 0) + 1.15 + speed * 0.0025);
          b.squashX = Math.max(b.squashX || 1, 1.34);
          b.squashY = Math.min(b.squashY || 1, 0.66);
          b.squashVelX = (b.squashVelX || 0) + (Math.random() - 0.5) * 3.8;
          b.squashVelY = (b.squashVelY || 0) - 3.1;
        } else if (b.vy > 10) {
          // Micro-quiques antes de assentar (efeito pudim).
          b.vy = -b.vy * 0.32;
          b.wobbleAmp = Math.min(9.5, (b.wobbleAmp || 0) + 0.35);
        } else {
          b.vy = 0;
        }
      }
    }

    for (let pass = 0; pass < 6; pass += 1) {
      for (let i = 0; i < blocks.length; i += 1) {
        const a = blocks[i];
        if (a.destroyed) continue;
        for (let j = i + 1; j < blocks.length; j += 1) {
          const b = blocks[j];
          if (b.destroyed) continue;
          resolveBlockOverlap(a, b);
        }
      }
    }

    if (!blockDamageEnabled) {
      for (const b of blocks) {
        if (b.destroyed) continue;
        if (b.y + b.h >= floorY - 1.5) {
          blockDamageEnabled = true;
          if (gameStartMs <= 0) gameStartMs = performance.now();
          break;
        }
      }
    }
  }

  /**
   * @param {number} nowMs
   */
  function hitShakeOffset(b, nowMs) {
    if (nowMs >= b.hitShakeUntil) return { ox: 0, oy: 0 };
    const w = (b.hitShakeUntil - nowMs) / 180;
    const s = 5 * w;
    const phase = nowMs * 0.08;
    return { ox: Math.sin(phase) * s, oy: Math.cos(phase * 1.3) * s * 0.6 };
  }

  /**
   * Punhos com velocidade suficiente para dano 1–3; movimento lento não conta.
   * @returns {{ x: number; y: number; side: "left"|"right"; pIdx: number; damage: number }[]}
   */
  function collectVelocityWristHits(pose, pIdx, nowMs) {
    if (!pose?.keypoints || !video) return [];
    const kps = pose.keypoints;
    const pts = [];

    function trySide(side) {
      const kp = findKp(kps, side === "left" ? "left_wrist" : "right_wrist");
      if (!kp || (kp.score ?? 0) < KP_MIN_SCORE) return;
      const key = `${pIdx}-${side}`;
      if (nowMs - (wristLastHitMs.get(key) ?? 0) < WRIST_HIT_COOLDOWN_MS) return;

      const speed = getWristSpeedNoUpdate(kp, pIdx, side, nowMs);
      const damage = damageFromSpeed(speed);
      if (damage <= 0) return;

      const p = mapKpToCanvas(kp, video, canvas, true);
      pts.push({ x: p.x, y: p.y, side, pIdx, damage });
    }

    trySide("left");
    trySide("right");
    return pts;
  }

  /**
   * Valor atual de um bloco destruído (decai linearmente até o piso em 60 s).
   * @param {number} nowMs
   */
  function currentBlockValue(nowMs) {
    if (gameStartMs <= 0) return BLOCK_BASE_VALUE;
    const elapsed = Math.max(0, nowMs - gameStartMs);
    const t = Math.min(1, elapsed / BLOCK_DECAY_DURATION_MS);
    return BLOCK_BASE_VALUE + (BLOCK_MIN_VALUE - BLOCK_BASE_VALUE) * t;
  }

  /**
   * Cor "parceira" do par do jogador `pi`. Retorna null se o par não tiver 2 cores.
   * @param {number} pi
   * @param {string} color
   */
  function partnerColorOf(pi, color) {
    const pair = PLAYER_COLOR_PAIRS[pi] || PLAYER_COLOR_PAIRS[0];
    if (pair[0] === color) return pair[1];
    if (pair[1] === color) return pair[0];
    return null;
  }

  /**
   * Popup grande para pontuação/combo acima do bloco destruído.
   * @param {{ x: number; y: number; w: number; h: number }} b
   * @param {number} gained
   * @param {number} mult
   * @param {string} comboCol
   * @param {number} nowMs
   */
  function pushScorePopup(b, gained, mult, comboCol, nowMs) {
    hitPopups.push({
      x: b.x + b.w / 2,
      y: b.y + b.h * 0.18,
      text: `+${gained}`,
      color: "#fef3c7",
      startMs: nowMs,
      duration: HIT_POPUP_MS + 180,
      big: true,
    });
    if (mult >= 2) {
      hitPopups.push({
        x: b.x + b.w / 2,
        y: b.y - b.h * 0.08,
        text: `${mult}x COMBO!`,
        color: comboCol || "#fde68a",
        startMs: nowMs + 40,
        duration: HIT_POPUP_MS + 320,
        big: true,
      });
    }
  }

  /**
   * Popup leve para `+10 COR!` quando a cor foi limpa mas não houve "perfeita".
   * @param {number} pi
   * @param {{ x: number; y: number; w: number; h: number; tint: string }} b
   * @param {number} nowMs
   */
  function triggerColorClearPopup(pi, b, nowMs) {
    hitPopups.push({
      x: b.x + b.w / 2,
      y: b.y - b.h * 0.35,
      text: `+${COLOR_CLEAR_BONUS} COR!`,
      color: b.tint || "#a7f3d0",
      startMs: nowMs,
      duration: HIT_POPUP_MS + 400,
      big: true,
    });
  }

  /**
   * Spawna confete colorido (partículas) para o bônus perfeito.
   * @param {number} cx
   * @param {number} cy
   * @param {string[]} colors
   * @param {number} n
   * @param {number} nowMs
   */
  function spawnConfetti(cx, cy, colors, n, nowMs) {
    const base = Math.max(7, Math.min(16, Math.min(canvas.width, canvas.height) * 0.01));
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const sp = 5 + Math.random() * 7;
      const col = colors[i % colors.length];
      debris.push({
        x: cx + (Math.random() - 0.5) * base,
        y: cy + (Math.random() - 0.5) * base,
        vx: Math.cos(a) * sp * 95,
        vy: (Math.sin(a) * sp - 2.2) * 95,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.6,
        size: base * (0.9 + Math.random() * 0.8),
        color: col,
        startMs: nowMs,
        duration: DEBRIS_MS * (1.2 + Math.random() * 0.6),
        shape: "rect",
      });
    }
  }

  /**
   * "Game juice" especial do bônus perfeito (+50): banner, slow-mo, flash, shake,
   * anel expansivo e burst colorido de confete.
   * @param {number} pi
   * @param {{ x: number; y: number; w: number; h: number; tint: string }} b
   * @param {number} nowMs
   */
  function triggerPerfectClearJuice(pi, b, nowMs) {
    const pair = PLAYER_COLOR_PAIRS[pi] || PLAYER_COLOR_PAIRS[0];
    perfectBanner = {
      startMs: nowMs,
      color: b.tint || pair[0] || "#fde68a",
      label: `COR PERFEITA! +${COLOR_PERFECT_BONUS}`,
    };
    screenShakeUntil = Math.max(screenShakeUntil, nowMs + PERFECT_SHAKE_MS);
    flashStart = nowMs;
    flashUntil = nowMs + PERFECT_FLASH_MS;
    perfectRing = {
      startMs: nowMs,
      cx: b.x + b.w / 2,
      cy: b.y + b.h / 2,
      color: b.tint || pair[0] || "#fde68a",
    };
    slowmoActive = true;
    slowmoStart = nowMs;
    spawnBoxDebris(b, nowMs, 3);
    spawnBoxDebris(b, nowMs, 3);
    spawnConfetti(b.x + b.w / 2, b.y + b.h / 2, [pair[0], pair[1]], 26, nowMs);
    playPerfectSound();
  }

  /** Som do bônus perfeito: dois hits de gelatina em sequência (usa a alternância global). */
  function playPerfectSound() {
    try {
      playJellyHitSound();
      setTimeout(() => {
        try {
          playJellyHitSound();
        } catch {
          /* ignore */
        }
      }, 120);
    } catch {
      /* ignore */
    }
  }

  /**
   * Aplica pontuação de destruição: combo por cor, bônus de cor limpa (+10 ou +50).
   * @param {{ x: number; y: number; w: number; h: number; tint: string; owner: 0|1 }} b
   * @param {number} pi
   * @param {number} nowMs
   */
  function awardDestroyScore(b, pi, nowMs) {
    const baseVal = currentBlockValue(nowMs);
    const sameColor = comboColor[pi] === b.tint;
    const idleOk = nowMs - comboLastDestroyMs[pi] <= COMBO_IDLE_RESET_MS;
    const mult = sameColor && idleOk ? comboMult[pi] + 1 : 1;

    comboColor[pi] = b.tint;
    comboMult[pi] = mult;
    comboLastDestroyMs[pi] = nowMs;

    const gained = Math.max(1, Math.round(baseVal * mult));
    scores[pi] += gained;
    pushScorePopup(b, gained, mult, b.tint, nowMs);

    // Tracking de cor limpa.
    if (!destroyedCountByColor[pi]) destroyedCountByColor[pi] = {};
    destroyedCountByColor[pi][b.tint] = (destroyedCountByColor[pi][b.tint] ?? 0) + 1;

    const totalForThis = totalByColor[pi]?.[b.tint] ?? 0;
    const countForThis = destroyedCountByColor[pi][b.tint];
    if (
      totalForThis > 0 &&
      countForThis >= totalForThis &&
      !colorClearedAwarded[pi].has(b.tint)
    ) {
      const other = partnerColorOf(pi, b.tint);
      const touchedOther = other
        ? (destroyedCountByColor[pi][other] ?? 0) > 0
        : false;
      const perfect = !touchedOther;
      scores[pi] += perfect ? COLOR_PERFECT_BONUS : COLOR_CLEAR_BONUS;
      colorClearedAwarded[pi].add(b.tint);
      if (perfect) triggerPerfectClearJuice(pi, b, nowMs);
      else triggerColorClearPopup(pi, b, nowMs);
    }
  }

  function tryDamageBlocks(nowMs) {
    if (finished || !video) return;

    const poses = getGamePoses();
    if (!blockDamageEnabled) return;
    if (gameStartMs <= 0) gameStartMs = nowMs;

    const points = [];
    for (let i = 0; i < poses.length; i += 1) {
      points.push(...collectVelocityWristHits(poses[i], i, nowMs));
    }
    if (points.length === 0) return;

    for (const b of blocks) {
      if (b.destroyed || b.hp <= 0) continue;
      if (nowMs - b.lastDamagedMs < BLOCK_HIT_INVUL_MS) continue;
      for (const { x, y, side, pIdx, damage } of points) {
        if (!single && b.owner !== pIdx) continue;
        if (pointInBlock(x, y, b)) {
          const applied = Math.min(damage, b.hp);
          b.hp -= applied;
          playJellyHitSound();
          b.lastDamagedMs = nowMs;
          b.hitFlashUntil = nowMs + HIT_FLASH_MS;
          b.hitShakeUntil = nowMs + 180;
          const imp = 1 + (applied - 1) * 0.12;
          b.vy += HIT_IMPULSE_Y * imp;
          b.vx += (Math.random() - 0.5) * 180;
          b.lastHitMs = nowMs;
          b.wobbleAmp = Math.min(9.5, (b.wobbleAmp || 0) + 1.85 * damage);
          b.squashX = 1 + 0.2 * damage;
          b.squashY = 1 - 0.16 * damage;
          b.squashVelX = (b.squashVelX || 0) + 3.4 * damage;
          b.squashVelY = (b.squashVelY || 0) - 3.4 * damage;
          const pi = pIdx === 1 ? 1 : 0;
          if (b.hp <= 0) {
            b.destroyed = true;
            spawnBoxDebris(b, nowMs, damage);
            awardDestroyScore(b, pi, nowMs);
          }
          wristLastHitMs.set(`${pIdx}-${side}`, nowMs);
          const fb = hitFeedbackForDamage(damage);
          hitPopups.push({
            x: b.x + b.w / 2,
            y: b.y + b.h * 0.38,
            text: fb.text,
            color: fb.color,
            startMs: nowMs,
            duration: HIT_POPUP_MS,
          });
          if (damage >= 3) {
            screenShakeUntil = nowMs + SCREEN_SHAKE_MS;
          }
          break;
        }
      }
    }
  }

  function spawnBoxDebris(b, nowMs, intensity) {
    const n = Math.round(
      Math.max(DEBRIS_N_MIN, Math.min(DEBRIS_N_MAX, DEBRIS_N_MIN + intensity * 2.5)),
    );
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const base = Math.max(6, Math.min(18, Math.min(b.w, b.h) * 0.12));
    const col = b.tint || "rgba(248,250,252,0.95)";
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const sp = (4.2 + Math.random() * 5.8) * (1 + 0.22 * intensity);
      debris.push({
        x: cx + (Math.random() - 0.5) * base,
        y: cy + (Math.random() - 0.5) * base,
        vx: Math.cos(a) * sp * 85,
        vy: (Math.sin(a) * sp - 1.2) * 85,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.35,
        size: base * (0.6 + Math.random() * 0.9),
        color: col,
        startMs: nowMs,
        duration: DEBRIS_MS * (0.85 + Math.random() * 0.35),
      });
    }
  }

  function remainingCount() {
    return blocks.filter((b) => !b.destroyed).length;
  }

  function remainingForOwner(ownerIdx) {
    return blocks.filter((b) => !b.destroyed && b.owner === ownerIdx).length;
  }

  /**
   * Fundo = câmara (contain ou cover conforme preferência), espelho X alinhado a `mapKpToCanvas`.
   */
  function drawCameraBackground() {
    const cw = canvas.width;
    const ch = canvas.height;
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, cw, ch);
    if (!video || (video.readyState ?? 0) < 2) {
      return;
    }
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw < 2 || vh < 2) {
      return;
    }
    const mode = getCameraFitMode();
    ctx.save();
    ctx.translate(cw, 0);
    ctx.scale(-1, 1);
    if (mode === "cover") {
      const scale = Math.max(cw / vw, ch / vh);
      const dispW = vw * scale;
      const dispH = vh * scale;
      const dx = (cw - dispW) / 2;
      const dy = (ch - dispH) / 2;
      ctx.drawImage(video, 0, 0, vw, vh, dx, dy, dispW, dispH);
    } else {
      const { dx, dy, dw, dh } = getVideoFitRect(cw, ch, vw, vh);
      ctx.drawImage(video, 0, 0, vw, vh, dx, dy, dw, dh);
    }
    ctx.restore();
  }

  function handSpriteBounds(px, py, w, h) {
    const top = py - h * HAND_SPRITE_ANCHOR_Y;
    return {
      left: px - w / 2,
      top,
      right: px + w / 2,
      bottom: top + h,
    };
  }

  function aabbOverlapSpriteBlock(S, B) {
    return S.left < B.right && S.right > B.left && S.top < B.bottom && S.bottom > B.top;
  }

  function blockDrawBounds(b, nowMs) {
    const { ox, oy } = hitShakeOffset(b, nowMs);
    return {
      left: b.x + ox,
      top: b.y + oy,
      right: b.x + ox + b.w,
      bottom: b.y + oy + b.h,
    };
  }

  /** Empurra o pivô do sprite para fora das caixas (só visual; golpes usam a pose real). */
  function resolveHandSpritePivot(px, py, w, h, nowMs) {
    let x = px;
    let y = py;
    const eps = 1;
    for (let iter = 0; iter < 12; iter += 1) {
      let moved = false;
      for (let i = 0; i < blocks.length; i += 1) {
        const b = blocks[i];
        if (b.destroyed) continue;
        const B = blockDrawBounds(b, nowMs);
        const S = handSpriteBounds(x, y, w, h);
        if (!aabbOverlapSpriteBlock(S, B)) continue;
        const overlapX = Math.min(S.right, B.right) - Math.max(S.left, B.left);
        const overlapY = Math.min(S.bottom, B.bottom) - Math.max(S.top, B.top);
        const scx = (S.left + S.right) * 0.5;
        const scy = (S.top + S.bottom) * 0.5;
        const bcx = (B.left + B.right) * 0.5;
        const bcy = (B.top + B.bottom) * 0.5;
        if (overlapX < overlapY) {
          x += scx < bcx ? -(overlapX + eps) : overlapX + eps;
        } else {
          y += scy < bcy ? -(overlapY + eps) : overlapY + eps;
        }
        moved = true;
      }
      if (!moved) break;
    }
    return { x, y };
  }

  /** Sprites nos punhos visíveis; escala ligeira quando a velocidade já permite dano. */
  function drawHandSprites(nowMs) {
    if (!video || !getBlockBreakerHandSpritesEnabled()) return;
    const imgL = handSpriteL;
    const imgR = handSpriteR;
    if (
      (!imgL || !imgL.complete || imgL.naturalWidth < 1) &&
      (!imgR || !imgR.complete || imgR.naturalWidth < 1)
    ) {
      return;
    }

    const poses = getGamePoses();

    syncVideoContentRect();
    const v = videoContentRect;
    const baseW = Math.min(v.w, v.h) * 0.14;

    // Isolar estado gráfico: evita que globalCompositeOperation/alpha/shadow
    // remanescentes de outras camadas (banner, flash, blocos) "apaguem" os sprites.
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowColor = "rgba(0,0,0,0)";
    for (let i = 0; i < poses.length; i += 1) {
      const kps = poses[i]?.keypoints;
      if (!kps) continue;
      for (const side of ["left", "right"]) {
        const img = side === "left" ? imgL : imgR;
        if (!img || !img.complete || img.naturalWidth < 1) continue;
        const key = `${i}-${side}`;
        const kp = findKp(kps, side === "left" ? "left_wrist" : "right_wrist");
        const score = kp?.score ?? 0;
        const seen = !!kp && score >= KP_DRAW_SCORE;
        let state = handSpriteState.get(key);

        if (seen) {
          const p = mapKpToCanvas(kp, video, canvas, true);
          if (!state) {
            state = { x: p.x, y: p.y, lastSeenMs: nowMs, alpha: 0, lastDrawMs: nowMs };
            handSpriteState.set(key, state);
          } else {
            // Suavização exponencial para reduzir jitter do MoveNet.
            state.x += (p.x - state.x) * HAND_SMOOTH_ALPHA;
            state.y += (p.y - state.y) * HAND_SMOOTH_ALPHA;
            state.lastSeenMs = nowMs;
          }
        } else {
          if (!state) continue;
          // Sem detecção: mantém a última posição válida durante o grace period.
          if (nowMs - state.lastSeenMs > HAND_STICKY_MS + HAND_FADE_OUT_MS) {
            handSpriteState.delete(key);
            continue;
          }
        }

        // Atualiza alpha (fade-in quando visível; fade-out após o sticky).
        const dt = Math.max(0, Math.min(120, nowMs - (state.lastDrawMs || nowMs)));
        state.lastDrawMs = nowMs;
        const withinSticky = nowMs - state.lastSeenMs <= HAND_STICKY_MS;
        const targetAlpha = withinSticky ? 1 : 0;
        const fadeMs = targetAlpha > state.alpha ? HAND_FADE_IN_MS : HAND_FADE_OUT_MS;
        const step = fadeMs > 0 ? dt / fadeMs : 1;
        if (targetAlpha > state.alpha) {
          state.alpha = Math.min(targetAlpha, state.alpha + step);
        } else {
          state.alpha = Math.max(targetAlpha, state.alpha - step);
        }
        if (state.alpha <= 0.01 && !withinSticky) {
          handSpriteState.delete(key);
          continue;
        }

        // Escala visual com base no golpe apenas quando a detecção é real (e confiável para hit).
        let scale = 1;
        let baseAlpha = 0.72;
        if (seen && score >= KP_MIN_SCORE) {
          const speed = getWristSpeedNoUpdate(kp, i, side, nowMs);
          const dmg = damageFromSpeed(speed);
          if (dmg > 0) {
            scale = 1.08;
            baseAlpha = 1;
          }
        }

        const ar = img.naturalHeight / img.naturalWidth;
        const w = baseW * scale;
        const h = w * ar;
        const q = resolveHandSpritePivot(state.x, state.y, w, h, nowMs);
        ctx.globalAlpha = baseAlpha * state.alpha;
        ctx.drawImage(img, q.x - w / 2, q.y - h * HAND_SPRITE_ANCHOR_Y, w, h);
      }
    }
    ctx.restore();
  }

  function drawBlocks(nowMs) {
    for (let i = 0; i < blocks.length; i += 1) {
      const b = blocks[i];
      if (b.destroyed) continue;
      const { ox, oy } = hitShakeOffset(b, nowMs);
      const drawX = b.x + ox;
      const drawY = b.y + oy;
      const img = gelSprite;
      const hpRatio = Math.max(0, Math.min(1, (b.hp || 0) / Math.max(1, b.maxHp || 1)));
      // 0 = intacto, 1 = totalmente danificado. Quanto maior, mais transparente fica o bloco.
      const damage = 1 - hpRatio;
      // Alpha do bloco: interpola entre 1.0 (intacto) e 0.4 (próximo de quebrar).
      const blockAlpha = Math.max(0.4, 1 - damage * 0.6);
      if (img && img.complete && img.naturalWidth >= 1) {
        const cx = drawX + b.w / 2;
        const cy = drawY + b.h / 2;
        const age = nowMs - (b.lastHitMs || 0);
        const decayPostHit = age > 0 ? Math.exp(-age / 560) : 0;
        // Jiggle persistente de gelatina: duas senoides com fases distintas para balanço orgânico.
        const bouncePhase = nowMs * 0.0068 + (b.wobblePhase || 0);
        const idleJiggle = 0.028 * Math.sin(bouncePhase);
        const idleJiggleY = 0.032 * Math.sin(bouncePhase * 1.35 + 0.7);
        const hitBoost = (b.wobbleAmp || 0) * decayPostHit;
        const wob = Math.sin(nowMs * 0.022 + (b.wobblePhase || 0)) * hitBoost * 0.24;
        const wobY = Math.cos(nowMs * 0.026 + (b.wobblePhase || 0) + 0.9) * hitBoost * 0.21;
        const sxRaw =
          (b.renderScaleX || 1) *
          (1 + wob + idleJiggle + ((b.squashX || 1) - 1) * decayPostHit);
        const syRaw =
          (b.renderScaleY || 1) *
          (1 - wobY - idleJiggleY + ((b.squashY || 1) - 1) * decayPostHit);
        const sx = Math.max(0.48, Math.min(1.68, sxRaw));
        const sy = Math.max(0.48, Math.min(1.68, syRaw));
        const rw = b.w * sx;
        const rh = b.h * sy;
        // Leve skew horizontal (shear) para "empurrar" a gelatina quando balança.
        const shear = Math.sin(bouncePhase * 0.9) * 0.055 + wob * 0.32;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(b.renderRot || 0);
        ctx.transform(1, 0, shear, 1, 0, 0);
        ctx.globalAlpha = blockAlpha;
        ctx.drawImage(img, -rw / 2, -rh / 2, rw, rh);
        // Tint da gelatina (sprite em tons de cinza).
        ctx.globalCompositeOperation = "source-atop";
        ctx.globalAlpha = 0.72 * blockAlpha;
        ctx.fillStyle = b.tint || "#94a3b8";
        ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
        // Preserva sombras/contraste do sprite
        ctx.globalCompositeOperation = "multiply";
        ctx.globalAlpha = 0.32 * blockAlpha;
        ctx.fillStyle = b.tint || "#94a3b8";
        ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
        ctx.restore();
      } else {
        const hue = single
          ? 210 + (i % 3) * 35
          : b.owner === 0
            ? 188 + (i % 4) * 14
            : 22 + (i % 4) * 12;
        ctx.save();
        ctx.globalAlpha = blockAlpha;
        ctx.fillStyle = b.tint || `hsl(${hue} 62% 48%)`;
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 2;
        const r = 8;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(drawX, drawY, b.w, b.h, r);
        } else {
          ctx.rect(drawX, drawY, b.w, b.h);
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      if (nowMs < b.hitFlashUntil) {
        const flashA = Math.min(0.75, (b.hitFlashUntil - nowMs) / HIT_FLASH_MS);
        ctx.fillStyle = `rgba(255, 255, 255, ${flashA * 0.45})`;
        ctx.fillRect(drawX, drawY, b.w, b.h);
        ctx.strokeStyle = `rgba(255, 220, 120, ${flashA * 0.85})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(drawX + 1, drawY + 1, b.w - 2, b.h - 2);
      }
    }
  }

  function fillScorePanel(x, y, w, h, radius) {
    ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, h, radius);
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /** Pontuação dentro da área do vídeo (mesmo aspect ratio que a câmara). */
  function drawHitPopups(nowMs) {
    const basePx = Math.round(Math.min(26, Math.max(18, canvas.width * 0.028)));
    const bigPx = Math.round(Math.min(46, Math.max(28, canvas.width * 0.044)));
    for (const p of hitPopups) {
      const age = nowMs - p.startMs;
      if (age < 0) continue;
      const u = Math.min(1, age / p.duration);
      const alpha = 1 - u * u;
      const rise = (p.big ? -72 : -52) * u;
      const scale = p.big
        ? 1 + 0.22 * Math.sin(u * Math.PI)
        : 1 + 0.12 * Math.sin(u * Math.PI);
      const sizePx = Math.round((p.big ? bigPx : basePx) * scale);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `900 ${sizePx}px system-ui,sans-serif`;
      ctx.fillStyle = p.color;
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = p.big ? 14 : 10;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (p.big) {
        ctx.strokeStyle = "rgba(0,0,0,0.75)";
        ctx.lineWidth = 4;
        ctx.strokeText(p.text, p.x, p.y + rise);
      }
      ctx.fillText(p.text, p.x, p.y + rise);
      ctx.restore();
    }
  }

  function updateAndCullDebris(dt, nowMs) {
    if (!debris.length) return;
    debris = debris.filter((d) => nowMs - d.startMs < d.duration);
    if (!debris.length) return;
    const g = DEBRIS_GRAVITY;
    for (const d of debris) {
      d.vy += g * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= Math.max(0, 1 - 2.4 * dt);
      d.rot += d.vr;
    }
  }

  function drawDebris(nowMs) {
    if (!debris.length) return;
    for (const d of debris) {
      const age = nowMs - d.startMs;
      const u = Math.min(1, age / d.duration);
      const a = (1 - u) * (1 - u);
      ctx.save();
      ctx.globalAlpha = Math.min(0.95, 0.15 + a);
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.fillStyle = d.color;
      const s = d.size;
      if (Math.random() < 0.4) {
        // retângulo
        ctx.fillRect(-s * 0.5, -s * 0.35, s, s * 0.7);
      } else {
        // triângulo
        ctx.beginPath();
        ctx.moveTo(-s * 0.55, s * 0.4);
        ctx.lineTo(s * 0.6, 0);
        ctx.lineTo(-s * 0.25, -s * 0.45);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Flash branco full-canvas decaindo de 0.45 → 0. */
  function drawFlashOverlay(nowMs) {
    if (nowMs >= flashUntil) return;
    const u = (nowMs - flashStart) / Math.max(1, flashUntil - flashStart);
    const alpha = Math.max(0, 0.45 * (1 - u));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  /** Anel expansivo colorido centrado no último bloco (bônus perfeito). */
  function drawPerfectRing(nowMs) {
    if (!perfectRing) return;
    const u = (nowMs - perfectRing.startMs) / PERFECT_RING_MS;
    if (u >= 1) {
      perfectRing = null;
      return;
    }
    const maxR = Math.min(canvas.width, canvas.height) * 0.9;
    const r = 40 + (maxR - 40) * u;
    const alpha = 1 - u;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.strokeStyle = perfectRing.color;
    ctx.lineWidth = Math.max(4, (1 - u) * 14);
    ctx.shadowColor = perfectRing.color;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(perfectRing.cx, perfectRing.cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Banner central "COR PERFEITA! +50" com fade-in/out e leve rotação. */
  function drawPerfectBanner(nowMs) {
    if (!perfectBanner) return;
    const u = (nowMs - perfectBanner.startMs) / PERFECT_BANNER_MS;
    if (u >= 1) {
      perfectBanner = null;
      return;
    }
    // Fade-in rápido nos primeiros 15%, fade-out nos últimos 25%.
    let alpha = 1;
    if (u < 0.15) alpha = u / 0.15;
    else if (u > 0.75) alpha = Math.max(0, (1 - u) / 0.25);

    const v = videoContentRect;
    const cx = v.x + v.w / 2;
    const cy = v.y + v.h * 0.42;
    const sizePx = Math.round(Math.min(110, Math.max(42, canvas.width * 0.09)));
    const tilt = Math.sin(u * Math.PI) * 0.04;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.font = `900 ${sizePx}px system-ui,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = perfectBanner.color;
    ctx.shadowBlur = 30;
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(perfectBanner.label, 0, 0);
    ctx.fillStyle = "#fffbeb";
    ctx.fillText(perfectBanner.label, 0, 0);
    ctx.shadowBlur = 0;
    // Sublinha com a cor da combo.
    ctx.font = `700 ${Math.round(sizePx * 0.38)}px system-ui,sans-serif`;
    ctx.fillStyle = perfectBanner.color;
    ctx.fillText("+ cor pristina!", 0, sizePx * 0.72);
    ctx.restore();
  }

  /**
   * Dispara a sequência visual de fim de partida: para o dano, aplica slow-mo,
   * shake/flash/banner e só chama `onFinish` depois de `END_SEQUENCE_MS`.
   * @param {any} result
   * @param {string} label
   * @param {string} sublabel
   * @param {string} [color]
   */
  function startEndingSequence(result, label, sublabel, color = "#fde68a") {
    if (endingSequence) return;
    const nowMs = performance.now();
    blockDamageEnabled = false;
    endingSequence = {
      startMs: nowMs,
      duration: END_SEQUENCE_MS,
      label,
      sublabel,
      color,
      result,
    };
    screenShakeUntil = Math.max(screenShakeUntil, nowMs + END_SHAKE_MS);
    flashStart = nowMs;
    flashUntil = nowMs + END_FLASH_MS;
    endingSlowmoActive = true;
    endingSlowmoStart = nowMs;
    // Limpa qualquer combo pendente para não disparar popup no frame atual.
    comboColor = [null, null];
    comboMult = [1, 1];
  }

  /** Overlay do banner de fim de partida (vitória/conclusão). */
  function drawEndingOverlay(nowMs) {
    if (!endingSequence) return;
    const u = Math.min(1, (nowMs - endingSequence.startMs) / endingSequence.duration);
    // Escurecimento suave do fundo.
    const dim = Math.min(0.35, 0.45 * u);
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = dim;
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Banner principal com fade-in, bounce e leve tilt.
    let alpha = 1;
    if (u < 0.12) alpha = u / 0.12;
    else if (u > 0.82) alpha = Math.max(0, (1 - u) / 0.18);
    const v = videoContentRect;
    const cx = v.x + v.w / 2;
    const cy = v.y + v.h * 0.44;
    const sizePx = Math.round(Math.min(130, Math.max(46, canvas.width * 0.1)));
    const bounce = u < 0.35 ? Math.sin(u * Math.PI * 2.7) * (1 - u) * 14 : 0;
    const tilt = Math.sin(u * Math.PI) * 0.035;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy + bounce);
    ctx.rotate(tilt);
    ctx.font = `900 ${sizePx}px system-ui,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = endingSequence.color;
    ctx.shadowBlur = 34;
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.strokeText(endingSequence.label, 0, 0);
    ctx.fillStyle = "#fffbeb";
    ctx.fillText(endingSequence.label, 0, 0);
    ctx.shadowBlur = 0;
    if (endingSequence.sublabel) {
      ctx.font = `700 ${Math.round(sizePx * 0.42)}px system-ui,sans-serif`;
      ctx.fillStyle = endingSequence.color;
      ctx.fillText(endingSequence.sublabel, 0, sizePx * 0.78);
    }
    ctx.restore();
  }

  function drawScore() {
    syncVideoContentRect();
    const v = videoContentRect;
    const centerY = v.y + Math.max(22, Math.min(46, v.h * 0.072));
    const mainPx = Math.round(Math.min(42, Math.max(22, v.w * 0.052)));
    const padX = 20;
    const padY = 12;
    const radius = 14;

    ctx.save();
    ctx.textBaseline = "middle";
    ctx.font = `800 ${mainPx}px system-ui,sans-serif`;

    if (single) {
      const label = `${scores[0]} pts`;
      const tw = ctx.measureText(label).width;
      const bw = tw + padX * 2;
      const bh = mainPx + padY * 2;
      const cx = v.x + v.w / 2;
      const bx = cx - bw / 2;
      const by = centerY - bh / 2;
      fillScorePanel(bx, by, bw, bh, radius);
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(248, 250, 252, 0.96)";
      ctx.fillText(label, cx, centerY);
    } else {
      const t1 = `P1  ${scores[0]}`;
      const t2 = `${scores[1]}  P2`;
      const w1 = ctx.measureText(t1).width + padX * 2;
      const w2 = ctx.measureText(t2).width + padX * 2;
      const bh = mainPx + padY * 2;
      const by = centerY - bh / 2;
      const mid = v.x + v.w / 2;
      const cxLeft = (v.x + mid) / 2;
      const cxRight = (mid + v.x + v.w) / 2;
      const bx1 = Math.max(v.x + 8, cxLeft - w1 / 2);
      const bx2 = Math.min(v.x + v.w - w2 - 8, cxRight - w2 / 2);

      fillScorePanel(bx1, by, w1, bh, radius);
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(52, 211, 153, 0.98)";
      ctx.fillText(t1, bx1 + padX, centerY);

      fillScorePanel(bx2, by, w2, bh, radius);
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(251, 146, 60, 0.98)";
      ctx.fillText(t2, bx2 + w2 - padX, centerY);
    }

    // Linha discreta com valor atual do bloco (decay) e combo em curso.
    const nowMs = performance.now();
    const blockVal = Math.round(currentBlockValue(nowMs));
    const subPx = Math.max(11, Math.round(mainPx * 0.36));
    ctx.font = `600 ${subPx}px system-ui,sans-serif`;
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 6;
    const subY = centerY + mainPx * 0.95;

    if (single) {
      const parts = [`Bloco: ${blockVal} pts`];
      if (comboMult[0] >= 2) parts.push(`${comboMult[0]}x`);
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(226, 232, 240, 0.85)";
      ctx.fillText(parts.join("  •  "), v.x + v.w / 2, subY);
    } else {
      const mid = v.x + v.w / 2;
      const cxLeft = (v.x + mid) / 2;
      const cxRight = (mid + v.x + v.w) / 2;
      const left = comboMult[0] >= 2 ? `${blockVal} pts  •  ${comboMult[0]}x` : `${blockVal} pts`;
      const right = comboMult[1] >= 2 ? `${comboMult[1]}x  •  ${blockVal} pts` : `${blockVal} pts`;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(167, 243, 208, 0.85)";
      ctx.fillText(left, cxLeft, subY);
      ctx.fillStyle = "rgba(253, 186, 116, 0.85)";
      ctx.fillText(right, cxRight, subY);
    }

    ctx.restore();
  }

  function gameLoop(t) {
    if (!gameplayPaused && !startTime) startTime = t;
    lastT = t;
    const elapsedSec = startTime ? (t - startTime) / 1000 : 0;

    const dtMs = lastPhysicsMs ? t - lastPhysicsMs : 1000 / 60;
    lastPhysicsMs = t;
    // Ending slow-mo tem prioridade sobre o slow-mo do +50.
    if (endingSlowmoActive) {
      const elapsed = t - endingSlowmoStart;
      if (elapsed <= END_SLOWMO_HOLD_MS) {
        timeScale = 0.28;
      } else if (elapsed <= END_SLOWMO_HOLD_MS + END_SLOWMO_RAMP_MS) {
        const k = (elapsed - END_SLOWMO_HOLD_MS) / END_SLOWMO_RAMP_MS;
        timeScale = 0.28 + (0.85 - 0.28) * k;
      } else {
        timeScale = 0.85;
        endingSlowmoActive = false;
      }
    } else if (slowmoActive) {
      const elapsed = t - slowmoStart;
      if (elapsed <= PERFECT_SLOWMO_HOLD_MS) {
        timeScale = 0.35;
      } else if (elapsed <= PERFECT_SLOWMO_HOLD_MS + PERFECT_SLOWMO_RAMP_MS) {
        const k = (elapsed - PERFECT_SLOWMO_HOLD_MS) / PERFECT_SLOWMO_RAMP_MS;
        timeScale = 0.35 + (1 - 0.35) * k;
      } else {
        timeScale = 1;
        slowmoActive = false;
      }
    } else if (!endingSequence) {
      timeScale = 1;
    }
    const dt = Math.min((dtMs / 1000) * timeScale, 0.045);

    if (!finished) {
      if (!gameplayPaused) {
        stepPhysics(dt);
        // Durante a sequência de fim, não aplica dano (e não toca hit sound).
        if (!endingSequence) tryDamageBlocks(t);
        updateAndCullDebris(dt, t);

        if (!endingSequence) {
          if (single) {
            if (remainingCount() === 0) {
              const s1 = scores[0];
              const s2 = scores[1];
              const result = {
                gameId: /** @type {const} */ ("blockBreaker"),
                mode: /** @type {const} */ ("single"),
                timeSec: elapsedSec,
                timeP1: elapsedSec,
                timeP2: 0,
                winner: /** @type {null|1|2} */ (null),
                scoreP1: s1,
                scoreP2: s2,
                scoreTotal: s1 + s2,
              };
              startEndingSequence(
                result,
                "COMBO COMPLETO!",
                `${s1} pontos  •  ${elapsedSec.toFixed(2)} s`,
                "#fde68a",
              );
            }
          } else {
            const r0 = remainingForOwner(0);
            const r1 = remainingForOwner(1);
            if (r0 === 0 && ownerClearTime[0] < 0) ownerClearTime[0] = t;
            if (r1 === 0 && ownerClearTime[1] < 0) ownerClearTime[1] = t;

            let win = null;
            if (ownerClearTime[0] >= 0 && ownerClearTime[1] >= 0) {
              win = ownerClearTime[0] <= ownerClearTime[1] ? 1 : 2;
            } else if (ownerClearTime[0] >= 0) {
              win = 1;
            } else if (ownerClearTime[1] >= 0) {
              win = 2;
            }

            if (win != null) {
              const s1 = scores[0];
              const s2 = scores[1];
              const result = {
                gameId: /** @type {const} */ ("blockBreaker"),
                mode: /** @type {const} */ ("multi"),
                timeSec: elapsedSec,
                timeP1: elapsedSec,
                timeP2: elapsedSec,
                winner: /** @type {null|1|2} */ (win),
                scoreP1: s1,
                scoreP2: s2,
                scoreTotal: s1 + s2,
              };
              const winColor = win === 1 ? "#34d399" : "#fb923c";
              startEndingSequence(
                result,
                win === 1 ? "P1 VENCE!" : "P2 VENCE!",
                `${s1}  ×  ${s2}`,
                winColor,
              );
            }
          }
        } else {
          // Ending ativo: ao expirar, chama onFinish.
          if (t - endingSequence.startMs >= endingSequence.duration) {
            finished = true;
            const pending = endingSequence;
            endingSequence = null;
            if (onFinish && pending?.result) onFinish(pending.result);
          }
        }
      }
    }

    drawCameraBackground();

    if (!finished) {
      if (!gameplayPaused) {
        hitPopups = hitPopups.filter((p) => t - p.startMs < p.duration);
        debris = debris.filter((d) => t - d.startMs < d.duration);
        ctx.save();
        if (t < screenShakeUntil) {
          const remaining = screenShakeUntil - t;
          const w = Math.min(1, remaining / SCREEN_SHAKE_MS);
          const mag = 5.5 * w;
          const ph = t * 0.09;
          ctx.translate(Math.sin(ph) * mag, Math.cos(ph * 1.2) * mag);
        }
        drawBlocks(t);
        drawDebris(t);
        drawHitPopups(t);
        drawPerfectRing(t);
        drawFlashOverlay(t);
        drawHandSprites(t);
        drawEndingOverlay(t);
        drawPerfectBanner(t);
        drawScore();
        ctx.restore();
        commitAllWristPrev(getGamePoses(), t);
      }
      drawPreviewPlayerTags();
    } else if (previewOverlay && pctx) {
      resizePreviewOverlay();
      pctx.clearRect(0, 0, previewOverlay.width, previewOverlay.height);
    }

    rafId = requestAnimationFrame(gameLoop);
  }

  function resumeGameplay() {
    gameplayPaused = false;
  }

  return {
    /** @param {{ startPaused?: boolean }} [opts] */
    start(opts = {}) {
      gameplayPaused = opts.startPaused === true;
      finished = false;
      startTime = 0;
      lastT = 0;
      lastPhysicsMs = 0;
      blockDamageEnabled = false;
      scores = [0, 0];
      ownerClearTime[0] = -1;
      ownerClearTime[1] = -1;
      blocksThisGameSingle = BLOCK_COUNT;
      blocksPerPlayerDuo = BLOCK_COUNT;
      wristPrev.clear();
      wristLastHitMs.clear();
      handSpriteState.clear();
      hitPopups = [];
      screenShakeUntil = 0;
      debris = [];
      // Reset de scoring/combo/juice.
      gameStartMs = 0;
      comboColor = [null, null];
      comboMult = [1, 1];
      comboLastDestroyMs = [0, 0];
      destroyedCountByColor = [{}, {}];
      totalByColor = [{}, {}];
      colorClearedAwarded = [new Set(), new Set()];
      perfectBanner = null;
      perfectRing = null;
      flashStart = 0;
      flashUntil = 0;
      timeScale = 1;
      slowmoActive = false;
      slowmoStart = 0;
      endingSequence = null;
      endingSlowmoActive = false;
      endingSlowmoStart = 0;
      resize();
      window.addEventListener("resize", resize);
      if (video) window.addEventListener("resize", resizePreviewOverlay);
      rafId = requestAnimationFrame(gameLoop);
    },
    resumeGameplay,
    stop() {
      cancelAnimationFrame(rafId);
      rafId = 0;
      window.removeEventListener("resize", resize);
      if (video) window.removeEventListener("resize", resizePreviewOverlay);
      finished = true;
      gameplayPaused = false;
    },
  };
}
