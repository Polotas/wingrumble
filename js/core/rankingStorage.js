/**
 * Ranking local (single-player) persistido em localStorage.
 *
 * Estrutura armazenada:
 *   {
 *     "blockBreaker": Entry[],
 *     "cleanScreen":  Entry[],
 *     "collect":      Entry[],
 *   }
 *
 * Entry = { name: string, score: number, timeSec: number, dateISO: string }
 *
 * - Guarda no máximo `MAX_ENTRIES` entradas por jogo (Top 10).
 * - Ordem por jogo:
 *     • blockBreaker: score desc, timeSec asc (desempate).
 *     • cleanScreen / collect: score desc (tempo é fixo).
 */

const STORAGE_KEY = "wingrumble-ranking-v1";
export const MAX_ENTRIES = 10;
const NAME_MAX_CHARS = 12;

/** Jogos suportados (Sprint 100 m fica de fora). */
export const SUPPORTED_GAME_IDS = /** @type {const} */ ([
  "blockBreaker",
  "cleanScreen",
  "collect",
]);

/** @typedef {typeof SUPPORTED_GAME_IDS[number]} RankingGameId */

/**
 * @typedef {Object} RankingEntry
 * @property {string} name
 * @property {number} score
 * @property {number} timeSec
 * @property {string} dateISO
 */

/**
 * @param {string} gameId
 * @returns {gameId is RankingGameId}
 */
export function isSupportedGameId(gameId) {
  return SUPPORTED_GAME_IDS.includes(/** @type {RankingGameId} */ (gameId));
}

/**
 * Comparador por jogo. Retorna negativo se `a` vem antes de `b`.
 * @param {RankingGameId} gameId
 * @param {RankingEntry} a
 * @param {RankingEntry} b
 */
function compareEntries(gameId, a, b) {
  const dScore = (b.score ?? 0) - (a.score ?? 0);
  if (dScore !== 0) return dScore;
  if (gameId === "blockBreaker") {
    return (a.timeSec ?? 0) - (b.timeSec ?? 0);
  }
  return 0;
}

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return {};
    return data;
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, RankingEntry[]>} data
 */
function writeAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore (quota ou modo privado) */
  }
}

/**
 * @param {unknown} value
 * @returns {RankingEntry|null}
 */
function normalizeEntry(value) {
  if (!value || typeof value !== "object") return null;
  const v = /** @type {Record<string, unknown>} */ (value);
  const score = Number(v.score);
  if (!Number.isFinite(score)) return null;
  const timeSec = Number(v.timeSec);
  const name = typeof v.name === "string" ? v.name : "";
  const dateISO = typeof v.dateISO === "string" ? v.dateISO : "";
  return {
    name: sanitizeName(name),
    score: Math.round(score),
    timeSec: Number.isFinite(timeSec) ? Math.max(0, timeSec) : 0,
    dateISO,
  };
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeName(raw) {
  const trimmed = String(raw ?? "").trim().slice(0, NAME_MAX_CHARS);
  return trimmed.length > 0 ? trimmed : "Anônimo";
}

/**
 * @param {RankingGameId} gameId
 * @returns {RankingEntry[]}
 */
export function getTopScores(gameId) {
  if (!isSupportedGameId(gameId)) return [];
  const all = readAll();
  const list = Array.isArray(all[gameId]) ? all[gameId] : [];
  const normalized = list
    .map((e) => normalizeEntry(e))
    .filter((e) => /** @type {RankingEntry|null} */ (e) !== null)
    .map((e) => /** @type {RankingEntry} */ (e));
  normalized.sort((a, b) => compareEntries(gameId, a, b));
  return normalized.slice(0, MAX_ENTRIES);
}

/**
 * @param {RankingGameId} gameId
 * @param {{ score: number, timeSec?: number }} candidate
 */
export function qualifiesForTop(gameId, candidate) {
  if (!isSupportedGameId(gameId)) return false;
  const score = Number(candidate?.score);
  if (!Number.isFinite(score) || score <= 0) return false;
  const list = getTopScores(gameId);
  if (list.length < MAX_ENTRIES) return true;
  const worst = list[list.length - 1];
  const probe = /** @type {RankingEntry} */ ({
    name: "",
    score: Math.round(score),
    timeSec: Number(candidate?.timeSec) || 0,
    dateISO: "",
  });
  return compareEntries(gameId, probe, worst) < 0;
}

/**
 * Insere uma entrada, ordena e trunca a 10.
 * Retorna a posição final (1-based) da entrada inserida; 0 se não entrou.
 * @param {RankingGameId} gameId
 * @param {{ name: string, score: number, timeSec?: number }} candidate
 * @returns {{ rank: number, saved: boolean }}
 */
export function saveScore(gameId, candidate) {
  if (!isSupportedGameId(gameId)) return { rank: 0, saved: false };
  const score = Number(candidate?.score);
  if (!Number.isFinite(score)) return { rank: 0, saved: false };

  const entry = /** @type {RankingEntry} */ ({
    name: sanitizeName(candidate?.name ?? ""),
    score: Math.round(score),
    timeSec: Number.isFinite(Number(candidate?.timeSec))
      ? Math.max(0, Number(candidate?.timeSec))
      : 0,
    dateISO: new Date().toISOString(),
  });

  const all = readAll();
  const current = Array.isArray(all[gameId]) ? all[gameId].slice() : [];
  current.push(entry);
  const sorted = current
    .map((e) => normalizeEntry(e))
    .filter((e) => /** @type {RankingEntry|null} */ (e) !== null)
    .map((e) => /** @type {RankingEntry} */ (e));
  sorted.sort((a, b) => compareEntries(gameId, a, b));

  const truncated = sorted.slice(0, MAX_ENTRIES);
  const rankIndex = truncated.findIndex(
    (e) => e.dateISO === entry.dateISO && e.score === entry.score && e.name === entry.name,
  );

  all[gameId] = truncated;
  writeAll(all);

  return {
    rank: rankIndex >= 0 ? rankIndex + 1 : 0,
    saved: rankIndex >= 0,
  };
}

/**
 * Deriva {score,timeSec} a partir de um payload de onFinish single-player.
 * Retorna null se o jogo não é suportado ou o resultado não é single.
 *
 * @param {any} result
 * @returns {{ gameId: RankingGameId, score: number, timeSec: number }|null}
 */
export function extractCandidateFromResult(result) {
  if (!result || result.mode !== "single") return null;
  const gameId = String(result.gameId || "");
  if (!isSupportedGameId(gameId)) return null;
  const score = Math.round(Number(result.scoreP1 ?? 0));
  if (!Number.isFinite(score)) return null;
  const timeSec = Number(result.timeSec ?? 0) || 0;
  return { gameId: /** @type {RankingGameId} */ (gameId), score, timeSec };
}
