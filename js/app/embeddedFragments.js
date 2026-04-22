export const EMBEDDED_FRAGMENTS = [
  `<div id="screen-loading" class="screen screen-loading">
  <div class="game-panel-stack game-panel-stack--sm">
    <div class="game-panel game-panel--loading">
      <div
        class="loading-progress"
        role="progressbar"
        aria-label="Carregando"
        aria-valuetext="Carregando"
        data-i18n-aria-label="loading.aria"
      >
        <div class="loading-progress__bar" aria-hidden="true"></div>
      </div>
      <p id="loading-status" class="loading-status" data-i18n="loading.preparing">Preparando…</p>
      <p id="loading-tip" class="loading-tip" aria-live="polite"></p>
    </div>
  </div>
  <p class="app-version" aria-hidden="true">v0.1.0</p>
</div>`,
  `<div id="screen-home" class="screen screen-home">
  <button
    type="button"
    id="btn-home-debug"
    class="btn-panel btn-panel--ghost home-debug-btn"
    aria-label="Debug (câmera e pose)"
    hidden
  >
    Debug
  </button>
  <div class="home-wrap">
    <div class="home-logo-wrap">
      <img class="home-logo" src="assets/logo.png" alt="Wing Rumble" decoding="async" />
    </div>
    <div class="game-panel-stack game-panel-stack--md">
      <div class="game-panel game-panel--home">
        <div class="home-actions">
          <button type="button" id="btn-mode-single" class="btn-home" disabled>
            <span data-i18n="home.single">Um jogador</span>
          </button>
          <button type="button" id="btn-mode-multi" class="btn-home" disabled>
            <span data-i18n="home.multi">Dois jogadores</span>
          </button>
          <button type="button" id="btn-home-ranking" class="btn-home btn-home--ghost">
            <span data-i18n="home.ranking">Ranking</span>
          </button>
        </div>
        <p class="home-hint" data-i18n="home.hint">Use a câmera em um lugar bem iluminado e deixe o corpo visível.</p>
      </div>
    </div>
  </div>
</div>`,
  `<div id="screen-mode-select" class="screen screen-mode-select">
  <header class="mode-select-top-bar" aria-label="Navegação">
    <div class="mode-select-top-bar__left">
      <button type="button" id="btn-mode-select-back" class="btn-screen-back mode-select-top-bar__back">
        <span data-i18n="nav.back">Voltar</span>
      </button>
    </div>
    <div class="mode-select-top-bar__center"></div>
    <div class="mode-select-top-bar__right">
      <p
        id="mode-select-players"
        class="game-select-players-badge mode-select-top-bar__badge"
        aria-live="polite"
      >
        <span data-i18n="players.two">2 Players</span>
      </p>
    </div>
  </header>
  <div class="mode-select-hero-wrap">
    <img
      class="mode-select-hero"
      src="assets/home-screen/GAmeMode.png"
      alt="Game Mode"
      decoding="async"
    />
  </div>
  <div class="mode-select-content">
    <ul class="game-select-list mode-select-list" role="list">
      <li class="game-select-item mode-select-item">
        <button
          type="button"
          id="btn-mode-quick"
          class="game-card game-card--active mode-select-card"
        >
          <span class="game-card__name">
            <img
              class="game-card__icon"
              src="assets/home-screen/QuickMatch.png"
              alt="Quick Play"
              decoding="async"
            />
          </span>
        </button>
      </li>
      <li class="game-select-item mode-select-item">
        <button
          type="button"
          id="btn-mode-minigames"
          class="game-card game-card--active mode-select-card"
        >
          <span class="game-card__name">
            <img
              class="game-card__icon"
              src="assets/home-screen/SelectGame.png"
              alt="Selecionar minigames"
              decoding="async"
            />
          </span>
        </button>
      </li>
    </ul>
  </div>
</div>`,
  `<div id="screen-quick-play" class="screen screen-quick-play">
  <header class="quick-play-top-bar" aria-label="Navegação">
    <div class="quick-play-top-bar__left">
      <button type="button" id="btn-quick-play-back" class="btn-screen-back quick-play-top-bar__back">
        <span data-i18n="nav.back">Voltar</span>
      </button>
    </div>
    <div class="quick-play-top-bar__center"></div>
    <div class="quick-play-top-bar__right">
      <p
        id="quick-play-players"
        class="game-select-players-badge quick-play-top-bar__badge"
        aria-live="polite"
      >
        <span data-i18n="players.two">2 Players</span>
      </p>
    </div>
  </header>

  <div class="quick-play-content">
    <div class="quick-play-hero-wrap">
      <img
        class="quick-play-hero"
        src="assets/home-screen/QuickMatch-corrido.png"
        alt="Quick Match"
        decoding="async"
      />
    </div>
    <div class="game-panel-stack game-panel-stack--md">
      <div class="game-panel game-panel--game-select quick-play-panel">
        <h2 class="quick-play-subtitle" data-i18n="quickPlay.roundsTitle">Número de rounds</h2>

        <fieldset class="quick-play-series" aria-label="Selecione a série" data-i18n-aria-label="quickPlay.bestOf.aria">
          <label class="quick-play-series__opt">
            <input type="radio" name="quick-play-bestof" value="3" checked />
            <span class="quick-play-series__label">3</span>
          </label>
          <label class="quick-play-series__opt">
            <input type="radio" name="quick-play-bestof" value="5" />
            <span class="quick-play-series__label">5</span>
          </label>
          <label class="quick-play-series__opt">
            <input type="radio" name="quick-play-bestof" value="7" />
            <span class="quick-play-series__label">7</span>
          </label>
        </fieldset>

        <div class="quick-play-actions">
          <button type="button" id="btn-quick-play-start" class="btn-panel btn-panel--quickmatch">
            <span data-i18n="quickPlay.start">Iniciar Quick Match</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>`,
  `<div id="screen-game-select" class="screen screen-game-select">
  <header class="game-select-top-bar" aria-label="Navegação">
    <div class="game-select-top-bar__left">
      <button type="button" id="btn-game-select-back" class="btn-screen-back game-select-top-bar__back">
        <span data-i18n="nav.back">Voltar</span>
      </button>
    </div>
    <div class="game-select-top-bar__center"></div>
    <div class="game-select-top-bar__right">
      <p
        id="game-select-players"
        class="game-select-players-badge game-select-top-bar__badge"
        aria-live="polite"
      >
        <span data-i18n="players.two">2 Players</span>
      </p>
    </div>
  </header>
  <div class="game-select-content">
    <img
      class="game-select-hero"
      src="assets/home-screen/SelectGame-corrido.png"
      alt="Select Game"
      decoding="async"
    />
  </div>

  <div class="game-panel-stack game-panel-stack--md">
    <div class="game-panel game-panel--game-select">
      <div class="game-carousel" aria-label="Carrossel de jogos" data-i18n-aria-label="gameSelect.carousel.aria">
        <button
          type="button"
          class="game-carousel__nav game-carousel__nav--prev"
          aria-label="Jogo anterior"
          data-i18n-aria-label="gameSelect.carousel.prev.aria"
        >
          ‹
        </button>

        <div class="game-carousel__viewport" data-game-carousel-viewport>
          <div class="game-carousel__track" data-game-carousel-track>
            <button
              type="button"
              id="btn-pick-blocks"
              class="game-card game-card--active game-carousel__item"
              data-game-id="blockBreaker"
            >
              <span class="game-card__name">
                <img
                  class="game-card__icon"
                  src="assets/select-game-screen/breack_blocks.png"
                  alt="Quebra-blocos"
                  data-i18n-alt="games.blockBreaker.alt"
                  decoding="async"
                />
              </span>
              <span class="game-card__desc" data-i18n="games.blockBreaker.desc">Destrua 6 blocos com as mãos — no duo, cooperativo no mesmo conjunto</span>
            </button>

            <button
              type="button"
              id="btn-pick-clean"
              class="game-card game-card--active game-carousel__item"
              data-game-id="cleanScreen"
            >
              <span class="game-card__name">
                <img
                  class="game-card__icon"
                  src="assets/select-game-screen/dust_swipe.png"
                  alt="Limpeza"
                  data-i18n-alt="games.cleanScreen.alt"
                  decoding="async"
                />
              </span>
              <span class="game-card__desc" data-i18n="games.cleanScreen.desc">Faça círculos com as mãos para limpar manchas</span>
            </button>

            <button
              type="button"
              id="btn-pick-collect"
              class="game-card game-card--active game-carousel__item"
              data-game-id="collect"
            >
              <span class="game-card__name">
                <img
                  class="game-card__icon"
                  src="assets/select-game-screen/FruitCollect.png"
                  alt="Coleta"
                  data-i18n-alt="games.collect.alt"
                  decoding="async"
                />
              </span>
              <span class="game-card__desc" data-i18n="games.collect.desc">Junte as mãos para formar um cesto e pegar frutas (cuidado com a bomba)</span>
            </button>

            <button
              type="button"
              id="btn-pick-sprint"
              class="game-card game-card--soon game-carousel__item"
              data-game-id="sprint100m"
              disabled
              aria-disabled="true"
            >
              <span class="game-card__name" data-i18n="games.sprint100m.name">Sprint 100 m</span>
              <span class="game-card__desc" data-i18n="games.sprint100m.soon">Indisponível no momento</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          class="game-carousel__nav game-carousel__nav--next"
          aria-label="Próximo jogo"
          data-i18n-aria-label="gameSelect.carousel.next.aria"
        >
          ›
        </button>
      </div>

      <div class="game-carousel__confirm">
        <button type="button" id="btn-game-select-confirm" class="btn-panel">
          <span data-i18n="gameSelect.confirm">Confirmar</span>
        </button>
      </div>
    </div>
  </div>
</div>`,
  `<div id="screen-ranking" class="screen screen-ranking">
  <header class="ranking-top-bar" aria-label="Navegação">
    <div class="ranking-top-bar__left">
      <button type="button" id="btn-ranking-back" class="btn-screen-back ranking-top-bar__back">
        <span data-i18n="nav.back">Voltar</span>
      </button>
    </div>
    <div class="ranking-top-bar__center"></div>
    <div class="ranking-top-bar__right"></div>
  </header>

  <section
    class="ranking-view ranking-view--list"
    id="ranking-view-list"
    aria-label="Selecione um minigame"
    data-i18n-aria-label="ranking.list.aria"
  >
    <h1 class="ranking-title" data-i18n="ranking.title">Ranking</h1>
    <ul class="ranking-game-list" role="list">
      <li class="ranking-game-item">
        <button
          type="button"
          class="game-card game-card--active ranking-game-card"
          data-ranking-game="blockBreaker"
        >
          <span class="game-card__name">
            <img
              class="game-card__icon"
              src="assets/select-game-screen/breack_blocks.png"
              alt="Quebra-blocos"
              decoding="async"
            />
          </span>
        </button>
      </li>
      <li class="ranking-game-item">
        <button
          type="button"
          class="game-card game-card--active ranking-game-card"
          data-ranking-game="cleanScreen"
        >
          <span class="game-card__name">
            <img
              class="game-card__icon"
              src="assets/select-game-screen/dust_swipe.png"
              alt="Limpeza"
              decoding="async"
            />
          </span>
        </button>
      </li>
      <li class="ranking-game-item">
        <button
          type="button"
          class="game-card game-card--active ranking-game-card"
          data-ranking-game="collect"
        >
          <span class="game-card__name">
            <img
              class="game-card__icon"
              src="assets/select-game-screen/FruitCollect.png"
              alt="Coleta"
              decoding="async"
            />
          </span>
        </button>
      </li>
    </ul>
  </section>

  <section
    class="ranking-view ranking-view--detail"
    id="ranking-view-detail"
    aria-label="Top 10"
    data-i18n-aria-label="ranking.detail.aria"
    hidden
  >
    <div class="ranking-detail-header">
      <img
        id="ranking-detail-icon"
        class="ranking-detail-icon"
        src=""
        alt=""
        decoding="async"
      />
    </div>
    <ol id="ranking-detail-list" class="ranking-list" role="list"></ol>
    <p id="ranking-detail-empty" class="ranking-empty" hidden data-i18n="ranking.empty">
      Ainda sem recordes. Jogue em Um jogador para começar!
    </p>
  </section>
</div>`,
  `<div id="screen-detection" class="screen screen-detection">
  <button type="button" id="btn-detection-back" class="btn-screen-back">
    <span data-i18n="nav.back">Voltar</span>
  </button>
  <div
    id="detection-controls-panel"
    class="game-panel game-panel--detection detection-controls-panel debug-detection-panel--dock"
  >
    <div class="detection-controls-panel__fit">
      <p class="detection-panel__title" data-i18n="detection.cameraView">Visualização da câmera</p>
      <div
        class="camera-fit-toggle camera-fit-toggle--panel"
        role="group"
        aria-label="Tipo de visualização da câmera"
        data-i18n-aria-label="detection.fit.group"
      >
        <button
          type="button"
          id="btn-camera-fit-contain"
          class="camera-fit-toggle__btn"
          aria-pressed="true"
          aria-label="Proporção da câmera"
          data-i18n-aria-label="detection.fit.contain.aria"
        >
          <svg
            class="camera-fit-toggle__icon"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
          >
            <rect x="4" y="5" width="16" height="14" rx="2.5" stroke="currentColor" stroke-width="2" />
            <rect x="7" y="8" width="10" height="8" rx="1.5" stroke="currentColor" stroke-width="2" opacity="0.65" />
          </svg>
          <span class="camera-fit-toggle__label" data-i18n="detection.fit.contain">Proporção</span>
        </button>
        <button
          type="button"
          id="btn-camera-fit-cover"
          class="camera-fit-toggle__btn"
          aria-pressed="false"
          aria-label="Tela cheia"
          data-i18n-aria-label="detection.fit.cover.aria"
        >
          <svg
            class="camera-fit-toggle__icon"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M9 5H6.5C5.67 5 5 5.67 5 6.5V9M15 5H17.5C18.33 5 19 5.67 19 6.5V9M9 19H6.5C5.67 19 5 18.33 5 17.5V15M15 19H17.5C18.33 19 19 18.33 19 17.5V15"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          <span class="camera-fit-toggle__label" data-i18n="detection.fit.cover">Tela cheia</span>
        </button>
      </div>
    </div>
    <div id="debug-detection-extra" class="debug-detection-extra" hidden>
      <p class="detection-panel__title" data-i18n="detection.debug.title">Debug — detecção</p>
      <label class="debug-detection-panel__label" for="debug-detection-score">
        <span data-i18n="detection.debug.minScore">Confiança mínima dos pontos (score)</span>
      </label>
      <div class="debug-detection-panel__row">
        <input
          id="debug-detection-score"
          class="debug-detection-panel__range"
          type="range"
          min="0"
          max="100"
          value="25"
          step="1"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="25"
          aria-label="Confiança mínima da detecção"
          data-i18n-aria-label="detection.debug.sliderAria"
        />
        <output id="debug-detection-score-value" class="debug-detection-panel__value" for="debug-detection-score"
          >0.25</output
        >
      </div>
      <div class="debug-detection-extra__field">
        <label class="debug-detection-checkbox-label" for="debug-blockbreaker-hand-sprites">
          <input
            type="checkbox"
            id="debug-blockbreaker-hand-sprites"
            class="debug-detection-checkbox"
            checked
          />
          <span data-i18n="detection.debug.handSprites">Sprites das mãos (Quebra-blocos)</span>
        </label>
      </div>
    </div>
  </div>
  <div class="detection-fullscreen video-stack">
    <video
      id="camera"
      class="camera--detection"
      autoplay
      playsinline
      muted
    ></video>
    <div
      class="detection-camera-loading"
      data-camera-loading
      aria-hidden="true"
      hidden
    >
      <div class="detection-camera-loading__card" role="status" aria-live="polite">
        <span class="detection-camera-loading__spinner" aria-hidden="true"></span>
        <span class="detection-camera-loading__text" data-camera-loading-text>
          <span data-i18n="detection.cameraLoading">Carregando câmera…</span>
        </span>
      </div>
    </div>
    <canvas id="overlay-detection"></canvas>
  </div>
  <div class="detection-panel-anchor">
    <div class="game-panel-stack game-panel-stack--md detection-panel-stack">
      <div class="game-panel game-panel--detection detection-panel--bottom">
        <p id="status-text" class="detection-panel__text" aria-live="polite"></p>
        <button
          type="button"
          id="btn-camera-start"
          class="btn-home btn-camera-start"
          hidden
        >
          <span data-i18n="detection.allowCamera">Permitir câmera</span>
        </button>
      </div>
    </div>
  </div>
</div>`,
  `<div id="screen-game" class="screen">
  <canvas id="game"></canvas>
  <div id="preview-slot" class="preview-slot">
    <canvas id="preview-overlay"></canvas>
  </div>
</div>`,
  `<div
  id="overlay-countdown-wrap"
  class="overlay-countdown-wrap"
  data-countdown-wrap
  aria-hidden="true"
>
  <div class="overlay-countdown-dim" aria-hidden="true"></div>
  <div
    id="overlay-countdown"
    class="overlay-countdown overlay-countdown__text"
    role="status"
  ></div>
</div>`,
  `<div
  id="overlay-blockbreaker-tutorial-wrap"
  class="overlay-bb-tutorial-wrap"
  aria-hidden="true"
>
  <div class="overlay-bb-tutorial-dim" aria-hidden="true"></div>
  <div class="overlay-bb-tutorial">
    <div
      id="overlay-blockbreaker-tutorial-text"
      class="overlay-bb-tutorial__text"
      role="status"
      data-i18n="games.blockBreaker.tutorial"
    ></div>
    <img
      id="overlay-blockbreaker-tutorial-img"
      class="overlay-bb-tutorial__img"
      src=""
      alt="Tutorial do Quebra-blocos"
      decoding="async"
      aria-hidden="true"
    />
    <div id="overlay-blockbreaker-tutorial-timer" class="overlay-bb-tutorial__timer" aria-hidden="true">
      3
    </div>
  </div>
</div>`,
  `<div
  id="panel-results"
  class="panel-results"
  hidden
  role="dialog"
  aria-modal="true"
  aria-labelledby="results-title"
>
  <div class="game-panel-stack game-panel-stack--md">
    <div class="game-panel game-panel--results panel-results__card">
      <h2 id="results-title" class="panel-results__title" data-i18n="results.title">Resultado</h2>
      <div id="panel-results-new-record" class="panel-results__new-record" hidden>
        <div class="panel-results__hero">
          <span
            id="panel-results-medal"
            class="panel-results__medal panel-results__medal--gold"
            data-rank="1"
            aria-hidden="true"
          >1</span>
          <p class="panel-results__rank-label" data-i18n="results.rankLabel">Sua posição no Top 10</p>
          <p id="panel-results-score-big" class="panel-results__score-big">0</p>
          <p id="panel-results-new-record-summary" class="panel-results__score-sub"></p>
        </div>
        <div id="panel-results-form" class="panel-results__form">
          <p class="panel-results__entered-top" data-i18n="results.enteredTop">Você entrou no Top 10!</p>
          <label class="panel-results__new-record-label" for="input-record-name">
            <span data-i18n="results.yourName">Seu nome</span>
          </label>
          <input
            type="text"
            id="input-record-name"
            class="panel-results__new-record-input"
            maxlength="12"
            autocomplete="off"
            spellcheck="false"
            placeholder="Digite seu nome"
            data-i18n-placeholder="results.namePlaceholder"
          />
          <button type="button" id="btn-record-save" class="btn-panel panel-results__new-record-save">
            <span data-i18n="results.save">Salvar recorde</span>
          </button>
        </div>
        <div id="panel-results-saved" class="panel-results__saved" hidden>
          <span class="panel-results__saved-check" aria-hidden="true">✓</span>
          <p id="panel-results-saved-text" class="panel-results__saved-text"></p>
        </div>
      </div>
      <p id="results-body" class="panel-results__body"></p>
      <div class="panel-results__actions">
        <button type="button" id="btn-results-restart" class="btn-panel">
          <span data-i18n="results.playAgain">Jogar de novo</span>
        </button>
        <button type="button" id="btn-results-home" class="btn-panel btn-panel--ghost">
          <span data-i18n="results.home">Início</span>
        </button>
      </div>
    </div>
  </div>
</div>`,
  `<div
  id="transition-curtain"
  class="transition-curtain"
  aria-hidden="true"
></div>`,
];
