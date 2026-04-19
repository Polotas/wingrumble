/**
 * UI da tela de Ranking: lista de minigames + detalhe com Top 10.
 */
import { getTopScores, isSupportedGameId } from "../core/rankingStorage.js";

/** @typedef {"blockBreaker"|"cleanScreen"|"collect"} RankingGameId */

const GAME_META = /** @type {Record<RankingGameId, { name: string, icon: string }>} */ ({
  blockBreaker: {
    name: "Quebra-blocos",
    icon: "assets/select-game-screen/breack_blocks.png",
  },
  cleanScreen: {
    name: "Limpeza",
    icon: "assets/select-game-screen/dust_swipe.png",
  },
  collect: {
    name: "Coleta",
    icon: "assets/select-game-screen/FruitCollect.png",
  },
});

/**
 * @param {RankingGameId} gameId
 * @param {{ name: string, score: number, timeSec: number }} entry
 */
function formatStats(gameId, entry) {
  const score = Number.isFinite(entry.score) ? Math.round(entry.score) : 0;
  if (gameId === "blockBreaker") {
    const t = Number.isFinite(entry.timeSec) ? entry.timeSec : 0;
    return `${score} pts • ${t.toFixed(2)} s`;
  }
  return `${score} pts`;
}

/**
 * Mostra a lista (esconde o detalhe).
 */
function showListView() {
  const list = document.getElementById("ranking-view-list");
  const detail = document.getElementById("ranking-view-detail");
  if (list) list.hidden = false;
  if (detail) detail.hidden = true;
}

/**
 * Troca para o detalhe e popula com o Top 10 do jogo.
 * @param {RankingGameId} gameId
 */
function showGameDetail(gameId) {
  if (!isSupportedGameId(gameId)) return;
  const list = document.getElementById("ranking-view-list");
  const detail = document.getElementById("ranking-view-detail");
  const icon = /** @type {HTMLImageElement|null} */ (
    document.getElementById("ranking-detail-icon")
  );
  const title = document.getElementById("ranking-detail-title");
  const ol = document.getElementById("ranking-detail-list");
  const empty = document.getElementById("ranking-detail-empty");

  const meta = GAME_META[gameId];
  if (icon && meta) {
    icon.src = meta.icon;
    icon.alt = meta.name;
  }
  if (title && meta) {
    title.textContent = meta.name;
  }

  const entries = getTopScores(gameId);
  if (ol) {
    ol.innerHTML = "";
    entries.forEach((entry, idx) => {
      const li = document.createElement("li");
      li.className = "ranking-list__item";
      if (idx < 3) li.classList.add("ranking-list__item--top");

      const rank = document.createElement("span");
      rank.className = "ranking-list__rank";
      rank.textContent = `${idx + 1}º`;

      const name = document.createElement("span");
      name.className = "ranking-list__name";
      name.textContent = entry.name || "Anônimo";

      const stats = document.createElement("span");
      stats.className = "ranking-list__stats";
      stats.textContent = formatStats(gameId, entry);

      li.appendChild(rank);
      li.appendChild(name);
      li.appendChild(stats);
      ol.appendChild(li);
    });
  }

  if (empty) empty.hidden = entries.length > 0;
  if (list) list.hidden = true;
  if (detail) detail.hidden = false;
}

/**
 * Liga eventos da tela de Ranking.
 * - Cards (data-ranking-game) → abrem detalhe.
 * - Botão "Voltar" da top-bar: se em detalhe, volta à lista; se em lista, chama `onBackFromList`.
 *
 * @param {{ onBackFromList: () => void }} opts
 * @returns {{ refresh: () => void, showList: () => void }}
 */
export function wireRankingScreen({ onBackFromList }) {
  const screen = document.getElementById("screen-ranking");
  if (!screen) return { refresh: () => {}, showList: () => {} };

  screen.addEventListener("click", (e) => {
    const t = /** @type {HTMLElement|null} */ (
      e.target instanceof HTMLElement ? e.target : null
    );
    const btn = t?.closest?.("button[data-ranking-game]");
    if (!btn) return;
    const gameId = /** @type {string} */ (btn.getAttribute("data-ranking-game"));
    if (isSupportedGameId(gameId)) showGameDetail(/** @type {RankingGameId} */ (gameId));
  });

  document.getElementById("btn-ranking-back")?.addEventListener("click", () => {
    const detail = document.getElementById("ranking-view-detail");
    if (detail && !detail.hidden) {
      showListView();
      return;
    }
    onBackFromList();
  });

  return {
    refresh: showListView,
    showList: showListView,
  };
}

/**
 * Chamada ao entrar na tela: garante que a view de lista está visível.
 */
export function enterRankingScreen() {
  showListView();
}
