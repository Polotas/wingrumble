export const EMBEDDED_FRAGMENTS = [
  `<div id="screen-loading" class="screen screen-loading">
  <div class="game-panel-stack game-panel-stack--sm">
    <div class="game-panel game-panel--loading">
      <div class="loading-progress" role="progressbar" aria-label="Carregando" aria-valuetext="Carregando">
        <div class="loading-progress__bar" aria-hidden="true"></div>
      </div>
      <p id="loading-status" class="loading-status">Preparando…</p>
      <p id="loading-tip" class="loading-tip" aria-live="polite"></p>
      <button
        type="button"
        id="btn-camera-start"
        class="btn-home btn-camera-start"
        hidden
      >
        Permitir câmera
      </button>
    </div>
  </div>
</div>`,
  `<div id="screen-home" class="screen screen-home">
  <div class="home-wrap">
    <div class="home-logo-wrap">
      <img class="home-logo" src="assets/logo.png" alt="Wing Rumble" decoding="async" />
    </div>
    <div class="game-panel-stack game-panel-stack--md">
      <div class="game-panel game-panel--home">
        <h1 class="home-title">Escolha o <br> modo de jogo</h1>
        <div class="home-actions">
          <button type="button" id="btn-mode-single" class="btn-home" disabled>
            Um jogador
          </button>
          <button type="button" id="btn-mode-multi" class="btn-home" disabled>
            Dois jogadores
          </button>
        </div>
        <p class="home-hint">Use a câmera em um lugar bem iluminado e deixe o corpo visível.</p>
      </div>
    </div>
  </div>
</div>`,
  `<div id="screen-mode-select" class="screen screen-mode-select">
  <header class="mode-select-top-bar" aria-label="Navegação">
    <div class="mode-select-top-bar__left">
      <button type="button" id="btn-mode-select-back" class="btn-screen-back mode-select-top-bar__back">
        Voltar
      </button>
    </div>
    <div class="mode-select-top-bar__center"></div>
    <div class="mode-select-top-bar__right">
      <p
        id="mode-select-players"
        class="game-select-players-badge mode-select-top-bar__badge"
        aria-live="polite"
      >
        2 Players
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
        Voltar
      </button>
    </div>
    <div class="quick-play-top-bar__center"></div>
    <div class="quick-play-top-bar__right">
      <p
        id="quick-play-players"
        class="game-select-players-badge quick-play-top-bar__badge"
        aria-live="polite"
      >
        2 Players
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
        <h2 class="quick-play-subtitle">Número de rounds</h2>

        <fieldset class="quick-play-series" aria-label="Selecione a série">
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
            Iniciar Quick Match
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
        Voltar
      </button>
    </div>
    <div class="game-select-top-bar__center"></div>
    <div class="game-select-top-bar__right">
      <p
        id="game-select-players"
        class="game-select-players-badge game-select-top-bar__badge"
        aria-live="polite"
      >
        2 Players
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
      <div class="game-carousel" aria-label="Carrossel de jogos">
        <button
          type="button"
          class="game-carousel__nav game-carousel__nav--prev"
          aria-label="Jogo anterior"
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
                  decoding="async"
                />
              </span>
              <span class="game-card__desc">Destrua 6 blocos com as mãos — no duo, cooperativo no mesmo conjunto</span>
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
                  decoding="async"
                />
              </span>
              <span class="game-card__desc">Faça círculos com as mãos para limpar manchas</span>
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
                  decoding="async"
                />
              </span>
              <span class="game-card__desc">Junte as mãos para formar um cesto e pegar frutas (cuidado com a bomba)</span>
            </button>

            <button
              type="button"
              id="btn-pick-sprint"
              class="game-card game-card--soon game-carousel__item"
              data-game-id="sprint100m"
              disabled
              aria-disabled="true"
            >
              <span class="game-card__name">Sprint 100 m</span>
              <span class="game-card__desc">Indisponível no momento</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          class="game-carousel__nav game-carousel__nav--next"
          aria-label="Próximo jogo"
        >
          ›
        </button>
      </div>

      <div class="game-carousel__confirm">
        <button type="button" id="btn-game-select-confirm" class="btn-panel">
          Confirmar
        </button>
      </div>
    </div>
  </div>
</div>`,
  `<div id="screen-detection" class="screen screen-detection">
  <button type="button" id="btn-detection-back" class="btn-screen-back">
    Voltar
  </button>
  <div class="detection-top-anchor">
    <div class="game-panel-stack game-panel-stack--sm detection-top-stack">
      <div class="game-panel game-panel--detection detection-panel--top">
        <p class="detection-panel__title">Selecione o tipo de visualização</p>
        <div
          class="camera-fit-toggle"
          role="group"
          aria-label="Tipo de visualização da câmara"
        >
          <button
            type="button"
            id="btn-camera-fit-contain"
            class="camera-fit-toggle__btn"
            aria-pressed="true"
            aria-label="Proporção da câmara"
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
            <span class="camera-fit-toggle__label">Proporção</span>
          </button>
          <button
            type="button"
            id="btn-camera-fit-cover"
            class="camera-fit-toggle__btn"
            aria-pressed="false"
            aria-label="Tela cheia"
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
            <span class="camera-fit-toggle__label">Tela cheia</span>
          </button>
        </div>
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
    <canvas id="overlay-detection"></canvas>
  </div>
  <div class="detection-panel-anchor">
    <div class="game-panel-stack game-panel-stack--md detection-panel-stack">
      <div class="game-panel game-panel--detection detection-panel--bottom">
        <p id="status-text" class="detection-panel__text" aria-live="polite"></p>
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
  id="panel-results"
  class="panel-results"
  hidden
  role="dialog"
  aria-modal="true"
  aria-labelledby="results-title"
>
  <div class="game-panel-stack game-panel-stack--md">
    <div class="game-panel game-panel--results panel-results__card">
      <h2 id="results-title" class="panel-results__title">Resultado</h2>
      <p id="results-body" class="panel-results__body"></p>
      <div class="panel-results__actions">
        <button type="button" id="btn-results-restart" class="btn-panel">
          Jogar de novo
        </button>
        <button type="button" id="btn-results-home" class="btn-panel btn-panel--ghost">
          Início
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
