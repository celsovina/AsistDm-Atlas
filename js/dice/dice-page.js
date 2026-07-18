/**
 * Página Dados — integra roll-dice completo en el shell Atlas.
 * Carga diferida de scripts/CSS; conserva físicas, sprites y color.
 */

const ASSET_BASE = 'roll-dice/';

const SCRIPT_SRCS = [
  'roll-dice/assets/sprites/packs.manifest.js',
  'roll-dice/js/core/dice-engine.js',
  'roll-dice/js/ui/d6-cube-renderer.js',
  'roll-dice/js/ui/sprite-dice-renderer.js',
  'roll-dice/js/ui/tray-physics.js',
  'roll-dice/js/ui/canvas-tint-manager.js',
  'roll-dice/js/ui/sprite-canvas-tint-applier.js',
  'roll-dice/js/ui/color-prefs.js',
  'roll-dice/js/ui/tray-scene.js',
  'roll-dice/js/ui/color-editor-ui.js',
  'roll-dice/js/ui/custom-modal.js',
  'roll-dice/js/ui/dice-roller-ui.js',
];

const STYLE_HREFS = ['roll-dice/css/roll-dice.css', 'css/dice.css'];

/**
 * @param {string} src
 * @returns {Promise<void>}
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-rd-src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.dataset.rdSrc = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(s);
  });
}

/**
 * @param {string} href
 */
function ensureStylesheet(href) {
  if (document.querySelector(`link[data-rd-href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.rdHref = href;
  document.head.appendChild(link);
}

function markup() {
  return `
    <div class="rd-app atlas-dice__app">
      <main class="rd-layout">
        <section class="rd-panel rd-panel--catalog" aria-label="Selector de dados">
          <div class="rd-catalog-block">
            <div class="rd-panel__header">
              <div class="rd-panel__header-row">
                <h2 class="rd-panel__title">Dados</h2>
                <div class="rd-panel__header-actions">
                  <button
                    class="rd-btn rd-btn--ghost rd-btn--icon rd-catalog-tool rd-clear-btn"
                    id="rd-clear-pool"
                    type="button"
                    aria-label="Limpiar"
                    title="Limpiar"
                  >
                    <i data-lucide="brush-cleaning"></i>
                  </button>
                </div>
              </div>
              <p class="rd-panel__hint">Pulsa para agregar. Ajusta con + / −.</p>
            </div>
            <div class="rd-catalog-actions">
              <div id="rd-dice-catalog" class="rd-catalog" aria-label="Catálogo de dados"></div>
              <button
                class="rd-btn rd-btn--ghost rd-btn--icon rd-catalog-tool rd-cog-fab"
                id="rd-open-custom"
                type="button"
                aria-label="Customizar"
                title="Customizar"
              >
                <div class="icon-cog"></div>
              </button>
            </div>
          </div>
        </section>

        <section class="rd-panel rd-panel--tray" aria-label="Bandeja">
          <div class="rd-panel__header">
            <div class="rd-panel__header-row">
              <h2 class="rd-panel__title">Bandeja</h2>
              <button class="rd-btn rd-btn--primary" id="rd-roll" type="button">Tirar</button>
            </div>
            <p class="rd-panel__hint">Pulsa la bandeja para tirar.</p>
          </div>
          <div id="rd-tray" class="rd-tray" aria-label="Bandeja de tirada"></div>
          <div id="rd-results-bar" class="rd-results-bar" aria-label="Resultados"></div>
        </section>
      </main>

      <div class="rd-modal" id="rd-custom-modal" aria-label="Custom" aria-hidden="true">
        <div class="rd-modal__backdrop" id="rd-custom-backdrop"></div>
        <div class="rd-modal__panel" role="dialog" aria-modal="true" aria-labelledby="rd-custom-title">
          <div class="rd-modal__header">
            <div class="rd-modal__title" id="rd-custom-title">Custom</div>
            <button class="rd-btn rd-btn--ghost rd-btn--icon" id="rd-custom-close" type="button" aria-label="Cerrar">✕</button>
          </div>
          <div class="rd-modal__content">
            <div class="rd-modal__section">
              <div class="rd-modal__section-title">Pack de dados</div>
              <div id="rd-pack-gallery" class="rd-pack-grid" aria-label="Galería de packs"></div>
            </div>
            <div class="rd-modal__section" id="rd-color-editor" aria-label="Editor de color">
              <div class="rd-modal__section-title">Color de dados</div>
              <div class="rd-color-modes" role="radiogroup" aria-label="Modo de color">
                <label class="rd-radio">
                  <input type="radio" name="rd-color-mode" value="none" />
                  <span>Sin color</span>
                </label>
                <label class="rd-radio">
                  <input type="radio" name="rd-color-mode" value="fixed" />
                  <span>Color fijo</span>
                </label>
                <label class="rd-radio">
                  <input type="radio" name="rd-color-mode" value="random" />
                  <span>Random</span>
                </label>
              </div>
              <div class="rd-color-row">
                <label class="rd-color-field">
                  <span class="rd-color-field__label">Color</span>
                  <input id="rd-color-fixed" type="color" value="#60a5fa" />
                </label>
                <label class="rd-color-field rd-color-field--grow">
                  <span class="rd-color-field__label">Intensidad <span id="rd-color-intensity-value">70%</span></span>
                  <input id="rd-color-intensity" type="range" min="0" max="100" value="70" />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.page
 */
export function createDicePage({ page }) {
  if (!page) {
    console.error('[Atlas] No se encontró #dice-page');
    return { show() {}, hide() {}, load() {} };
  }

  let mounted = false;
  let loading = null;

  async function ensureLoaded() {
    if (window.__atlasRollDiceBooted && mounted) return;
    if (loading) return loading;

    loading = (async () => {
      window.RollDiceAssetBase = ASSET_BASE;
      STYLE_HREFS.forEach(ensureStylesheet);

      if (!mounted) {
        page.innerHTML = markup();
        mounted = true;
      }

      for (const src of SCRIPT_SRCS) {
        await loadScript(src);
      }

      if (
        !window.__atlasRollDiceBooted &&
        typeof window.RollDiceBoot === 'function'
      ) {
        window.RollDiceBoot();
      }

      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
    })();

    try {
      await loading;
    } finally {
      loading = null;
    }
  }

  return {
    async load() {
      try {
        await ensureLoaded();
      } catch (err) {
        console.error('[Atlas] Error cargando Dados:', err);
        page.innerHTML =
          '<p class="atlas-dice__error">No se pudo cargar el módulo de dados.</p>';
        mounted = false;
      }
    },
    show() {
      page.hidden = false;
      page.removeAttribute('hidden');
    },
    hide() {
      page.hidden = true;
    },
  };
}
