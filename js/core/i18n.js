import { getUserPrefs, subscribeUserPrefs } from "./userPrefs.js";

/** @typedef {"pt-BR"|"en"} AppLanguage */

const DICT = {
  "pt-BR": {
    // Global / nav
    "nav.back": "Voltar",
    "global.fullscreen.enter": "Tela cheia",
    "global.fullscreen.exit": "Sair da tela cheia",
    "global.options": "Opções",
    "options.title": "Opções",
    "options.language": "Idioma",
    "options.language.ptBR": "Português (Brasil)",
    "options.language.en": "English",
    "options.volume.bg": "Música (BG)",
    "options.volume.sfx": "Efeitos (SFX)",
    "options.close": "Fechar",

    // Loading
    "loading.aria": "Carregando",
    "loading.preparing": "Preparando…",
    "loading.ready": "Pronto!",
    "loading.tip.0": "Dica: use um lugar bem iluminado para melhorar a detecção.",
    "loading.tip.1": "Dica: deixe o corpo inteiro visível na câmera.",
    "loading.tip.2": "Dica: evite luz forte atrás de você (contra-luz).",
    "loading.tip.3": "Dica: mantenha o celular firme (ou apoie em um suporte).",
    "loading.tip.4": "Dica: para 2 jogadores, fiquem um à esquerda e outro à direita.",
    "loading.error.noCameraDom": "Erro: câmera não encontrada no DOM.",
    "loading.error.modelFail": "Falha ao carregar o modelo. Recarregue a página.",
    "loading.error.httpsNeeded":
      "A câmera precisa de HTTPS ou localhost. Quando for calibrar, abra o site em https:// (ou localhost).",

    // Home
    "home.single": "Um jogador",
    "home.multi": "Dois jogadores",
    "home.ranking": "Ranking",
    "home.hint": "Use a câmera em um lugar bem iluminado e deixe o corpo visível.",
    "home.status.ready": "Escolha um ou dois jogadores.",

    // Ranking
    "ranking.title": "Ranking",
    "ranking.list.aria": "Selecione um minigame",
    "ranking.detail.aria": "Top 10",
    "ranking.empty": "Ainda sem recordes. Jogue em Um jogador para começar!",

    // Players badge
    "players.one": "1 Jogador",
    "players.two": "2 Jogadores",

    // Mode / game select / quick play
    "gameSelect.carousel.aria": "Carrossel de jogos",
    "gameSelect.carousel.prev.aria": "Jogo anterior",
    "gameSelect.carousel.next.aria": "Próximo jogo",
    "gameSelect.confirm": "Confirmar",
    "quickPlay.roundsTitle": "Número de rounds",
    "quickPlay.bestOf.aria": "Selecione a série",
    "quickPlay.start": "Iniciar Quick Match",

    // Game descriptions / names / alts
    "games.blockBreaker.alt": "Quebra-blocos",
    "games.blockBreaker.desc": "Destrua 6 blocos com as mãos — no duo, cooperativo no mesmo conjunto",
    "games.cleanScreen.alt": "Limpeza",
    "games.cleanScreen.desc": "Faça círculos com as mãos para limpar manchas",
    "games.collect.alt": "Coleta",
    "games.collect.desc": "Junte as mãos para formar um cesto e pegar frutas (cuidado com a bomba)",
    "games.sprint100m.name": "Sprint 100 m",
    "games.sprint100m.soon": "Indisponível no momento",

    // Results panel
    "results.title": "Resultado",
    "results.newRecord": "Novo Recorde!",
    "results.yourName": "Seu nome",
    "results.namePlaceholder": "Digite seu nome",
    "results.save": "Salvar recorde",
    "results.playAgain": "Jogar de novo",
    "results.home": "Início",

    // Detection
    "detection.cameraView": "Visualização da câmera",
    "detection.fit.group": "Tipo de visualização da câmera",
    "detection.fit.contain": "Proporção",
    "detection.fit.contain.aria": "Proporção da câmera",
    "detection.fit.cover": "Tela cheia",
    "detection.fit.cover.aria": "Tela cheia",
    "detection.debug.title": "Debug — detecção",
    "detection.debug.minScore": "Confiança mínima dos pontos (score)",
    "detection.debug.sliderAria": "Confiança mínima da detecção",
    "detection.debug.handSprites": "Sprites das mãos (Quebra-blocos)",
    "detection.cameraLoading": "Carregando câmera…",
    "detection.openingCamera": "Abrindo câmera…",
    "detection.allowCamera": "Permitir câmera",
    "detection.status.base": "Mostre as mãos para detetar.",
    "detection.error.https": "A câmera precisa de HTTPS ou localhost. Abra o site em https:// para calibrar.",
    "detection.error.permissions":
      "Não foi possível usar a câmera. Verifique as permissões do navegador e tente novamente.",
    "detection.tapToAllow": "Toque em “Permitir câmera” para continuar",
  },
  en: {
    // Global / nav
    "nav.back": "Back",
    "global.fullscreen.enter": "Fullscreen",
    "global.fullscreen.exit": "Exit fullscreen",
    "global.options": "Options",
    "options.title": "Options",
    "options.language": "Language",
    "options.language.ptBR": "Portuguese (Brazil)",
    "options.language.en": "English",
    "options.volume.bg": "Music (BG)",
    "options.volume.sfx": "SFX",
    "options.close": "Close",

    // Loading
    "loading.aria": "Loading",
    "loading.preparing": "Preparing…",
    "loading.ready": "Ready!",
    "loading.tip.0": "Tip: use good lighting to improve detection.",
    "loading.tip.1": "Tip: keep your full body visible in the camera.",
    "loading.tip.2": "Tip: avoid strong backlight (light behind you).",
    "loading.tip.3": "Tip: keep your phone steady (or use a stand).",
    "loading.tip.4": "Tip: for 2 players, stand left and right.",
    "loading.error.noCameraDom": "Error: camera element not found in the DOM.",
    "loading.error.modelFail": "Failed to load the model. Please reload the page.",
    "loading.error.httpsNeeded":
      "Camera requires HTTPS or localhost. When calibrating, open the site on https:// (or localhost).",

    // Home
    "home.single": "Single player",
    "home.multi": "Two players",
    "home.ranking": "Ranking",
    "home.hint": "Use the camera in a well-lit place and keep your body visible.",
    "home.status.ready": "Choose one or two players.",

    // Ranking
    "ranking.title": "Ranking",
    "ranking.list.aria": "Select a minigame",
    "ranking.detail.aria": "Top 10",
    "ranking.empty": "No records yet. Play in Single player to start!",

    // Players badge
    "players.one": "1 Player",
    "players.two": "2 Players",

    // Mode / game select / quick play
    "gameSelect.carousel.aria": "Game carousel",
    "gameSelect.carousel.prev.aria": "Previous game",
    "gameSelect.carousel.next.aria": "Next game",
    "gameSelect.confirm": "Confirm",
    "quickPlay.roundsTitle": "Number of rounds",
    "quickPlay.bestOf.aria": "Select the series",
    "quickPlay.start": "Start Quick Match",

    // Game descriptions / names / alts
    "games.blockBreaker.alt": "Block Breaker",
    "games.blockBreaker.desc": "Break 6 blocks with your hands — in duo, both players cooperate on the same set",
    "games.cleanScreen.alt": "Cleaning",
    "games.cleanScreen.desc": "Make circles with your hands to clean stains",
    "games.collect.alt": "Collect",
    "games.collect.desc": "Bring your hands together to form a basket and catch fruits (watch out for the bomb)",
    "games.sprint100m.name": "Sprint 100 m",
    "games.sprint100m.soon": "Unavailable for now",

    // Results panel
    "results.title": "Results",
    "results.newRecord": "New Record!",
    "results.yourName": "Your name",
    "results.namePlaceholder": "Type your name",
    "results.save": "Save record",
    "results.playAgain": "Play again",
    "results.home": "Home",

    // Detection
    "detection.cameraView": "Camera view",
    "detection.fit.group": "Camera view mode",
    "detection.fit.contain": "Contain",
    "detection.fit.contain.aria": "Camera aspect ratio",
    "detection.fit.cover": "Cover",
    "detection.fit.cover.aria": "Fill screen",
    "detection.debug.title": "Debug — detection",
    "detection.debug.minScore": "Minimum keypoint confidence (score)",
    "detection.debug.sliderAria": "Minimum detection confidence",
    "detection.debug.handSprites": "Hand sprites (Block Breaker)",
    "detection.cameraLoading": "Loading camera…",
    "detection.openingCamera": "Opening camera…",
    "detection.allowCamera": "Allow camera",
    "detection.status.base": "Show your hands to detect.",
    "detection.error.https": "Camera requires HTTPS or localhost. Open the site on https:// to calibrate.",
    "detection.error.permissions":
      "Couldn't use the camera. Check your browser permissions and try again.",
    "detection.tapToAllow": "Tap “Allow camera” to continue",
  },
};

function resolveLanguage() {
  const p = getUserPrefs();
  return p?.language === "en" ? "en" : "pt-BR";
}

export function t(key) {
  const lang = resolveLanguage();
  return DICT[lang]?.[key] ?? DICT["pt-BR"]?.[key] ?? key;
}

/**
 * Aplica traduções no DOM.
 * - data-i18n: textContent
 * - data-i18n-html: innerHTML (use com parcimônia)
 * - data-i18n-aria-label: aria-label
 * - data-i18n-placeholder: placeholder
 * @param {ParentNode} [root]
 */
export function applyI18n(root = document) {
  const lang = resolveLanguage();
  try {
    document.documentElement.lang = lang;
  } catch {
    /* ignore */
  }

  root.querySelectorAll?.("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    el.textContent = t(key);
  });

  root.querySelectorAll?.("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    if (!key) return;
    el.innerHTML = t(key);
  });

  root.querySelectorAll?.("[data-i18n-aria-label]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria-label");
    if (!key) return;
    el.setAttribute("aria-label", t(key));
  });

  root.querySelectorAll?.("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (!key) return;
    el.setAttribute("placeholder", t(key));
  });

  // <img alt="..."> etc.
  root.querySelectorAll?.("[data-i18n-alt]").forEach((el) => {
    const key = el.getAttribute("data-i18n-alt");
    if (!key) return;
    el.setAttribute("alt", t(key));
  });
}

export function bindI18nAutoApply() {
  applyI18n(document);
  return subscribeUserPrefs(() => applyI18n(document));
}

