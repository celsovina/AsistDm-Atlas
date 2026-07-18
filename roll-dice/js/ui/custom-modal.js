/**
 * CustomModal — UI para preferencias (pack de sprites, etc.)
 * Responsabilidades:
 * - Abrir/cerrar modal
 * - Cambiar pack de sprites y persistir (via SpriteDiceRenderer)
 */
(function () {
  'use strict';

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function on(el, evt, fn) {
    if (!el) return;
    el.addEventListener(evt, fn);
  }

  function assetBase() {
    const raw = String(window.RollDiceAssetBase || './').trim() || './';
    return raw.replace(/\/?$/, '/');
  }

  async function loadPacksFromManifest() {
    try {
      const res = await fetch(assetBase() + 'assets/sprites/packs.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('bad json');
      return data.map(function (x) { return String(x).trim(); }).filter(Boolean);
    } catch (_) {
      // fallback (sin servidor / file:// puede bloquear fetch)
      const fromGlobal = window.RollDicePacks;
      if (Array.isArray(fromGlobal) && fromGlobal.length) {
        return fromGlobal.map(function (x) { return String(x).trim(); }).filter(Boolean);
      }
      return ['crystal', 'obsidian'];
    }
  }

  function getD20PreviewStyle(packName) {
    const atlas = window.SpriteDiceRenderer && window.SpriteDiceRenderer._ATLAS && window.SpriteDiceRenderer._ATLAS.d20;
    const toPercent = window.SpriteDiceRenderer && window.SpriteDiceRenderer._toPercent;
    const cell = atlas && atlas.map ? atlas.map[20] : { col: 4, row: 3 };
    const cols = atlas && atlas.cols ? atlas.cols : 5;
    const rows = atlas && atlas.rows ? atlas.rows : 4;
    const uv = toPercent ? toPercent(cell.col, cell.row, cols, rows) : { u: (cell.col / (cols - 1)) * 100, v: (cell.row / (rows - 1)) * 100 };
    const url = assetBase() + 'assets/sprites/' + encodeURIComponent(packName) + '/d20_atlas.png';
    return { cols: cols, rows: rows, u: uv.u, v: uv.v, url: url };
  }

  function renderPackGallery(container, packs, activePack) {
    container.innerHTML = '';
    packs.forEach(function (pack) {
      const p = String(pack).trim();
      if (!p) return;
      const prev = getD20PreviewStyle(p);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rd-pack-card' + (p === activePack ? ' rd-pack-card--active' : '');
      btn.setAttribute('data-pack', p);
      btn.setAttribute('aria-pressed', p === activePack ? 'true' : 'false');
      btn.innerHTML = [
        '<div class="rd-pack-card__die">',
        '  <div class="rd-sprite" style="--cols:' + prev.cols + ';--rows:' + prev.rows + ';--u:' + prev.u + '%;--v:' + prev.v + '%;background-image:url(' + prev.url + ');"></div>',
        '</div>',
        '<div class="rd-pack-card__name">' + p + '</div>',
      ].join('');
      container.appendChild(btn);
    });
  }

  function renderLucideIcons() {
    const lucide = window.lucide;
    const nodes = Array.from(document.querySelectorAll('.icon-cog'));
    if (!nodes.length) return;

    nodes.forEach(function (el) {
      el.classList.remove('icon-cog--fallback');
      el.innerHTML = '';
    });

    // Preferir API de icons.toSvg si existe
    if (lucide && lucide.icons && lucide.icons.cog && typeof lucide.icons.cog.toSvg === 'function') {
      const svg = lucide.icons.cog.toSvg({ width: 18, height: 18, strokeWidth: 2 });
      nodes.forEach(function (el) { el.innerHTML = svg; });
      return;
    }

    // Fallback: usar createIcons (API más común en CDN)
    const createIcons = (lucide && typeof lucide.createIcons === 'function')
      ? lucide.createIcons.bind(lucide)
      : (typeof lucide === 'function' ? lucide : null);

    if (createIcons) {
      nodes.forEach(function (el) {
        el.innerHTML = '<i data-lucide="cog"></i>';
      });
      try {
        createIcons();
      } catch (_) {}

      nodes.forEach(function (el) {
        if (!el.querySelector('svg')) {
          el.classList.add('icon-cog--fallback');
        }
      });
      return;
    }

    // Sin lucide disponible: fallback CSS
    nodes.forEach(function (el) {
      el.classList.add('icon-cog--fallback');
    });
  }

  function init() {
    const openBtn = qs('#rd-open-custom');
    const modal = qs('#rd-custom-modal');
    const backdrop = qs('#rd-custom-backdrop');
    const closeBtn = qs('#rd-custom-close');
    const packGallery = qs('#rd-pack-gallery');
    const colorEditor = qs('#rd-color-editor');

    if (!modal || !backdrop || !packGallery) return;

    function open() {
      modal.classList.add('rd-modal--open');
    }

    function close() {
      modal.classList.remove('rd-modal--open');
    }

    on(openBtn, 'click', function () { open(); });
    on(closeBtn, 'click', function () { close(); });
    on(backdrop, 'click', function () { close(); });

    on(document, 'keydown', function (ev) {
      if (ev.key === 'Escape') close();
    });

    // init icon (lucide)
    renderLucideIcons();

    // init gallery (manifest)
    (async function () {
      const packs = await loadPacksFromManifest();
      const current = (window.SpriteDiceRenderer && typeof window.SpriteDiceRenderer.getPack === 'function')
        ? window.SpriteDiceRenderer.getPack()
        : 'crystal';
      renderPackGallery(packGallery, packs, current);
    })();

    // init color editor
    if (colorEditor && window.RollDiceColorEditorUI && typeof window.RollDiceColorEditorUI.init === 'function') {
      window.RollDiceColorEditorUI.init({ root: document });
    }

    on(packGallery, 'click', function (ev) {
      const btn = ev.target.closest && ev.target.closest('button[data-pack]');
      if (!btn) return;
      const next = btn.getAttribute('data-pack');
      if (!next) return;
      if (!window.SpriteDiceRenderer || typeof window.SpriteDiceRenderer.setPack !== 'function') return;

      window.SpriteDiceRenderer.setPack(next);

      // actualizar estado visual
      Array.from(packGallery.querySelectorAll('button[data-pack]')).forEach(function (b) {
        const isActive = b.getAttribute('data-pack') === next;
        b.classList.toggle('rd-pack-card--active', isActive);
        b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    });
  }

  window.RollDiceCustomModal = { init: init };
})();

