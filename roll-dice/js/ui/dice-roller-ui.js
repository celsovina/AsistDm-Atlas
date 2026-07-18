/**
 * Dice Roller UI (standalone) — DOM + animación (usa DiceEngine)
 * Responsabilidades:
 * - Render catálogo / pool / bandeja / resultados
 * - Manejar eventos (agregar, +/-, vaciar, tirar)
 * - Animar dados y sincronizar con resultados
 */
(function () {
  'use strict';

  function el(id) {
    const node = document.getElementById(id);
    if (!node) throw new Error('UI: elemento no encontrado: #' + id);
    return node;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function clampInt(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    const xi = Math.trunc(x);
    return Math.min(max, Math.max(min, xi));
  }

  function diePolygonPoints(dieId) {
    // Siluetas simples en SVG (no 3D real, pero con shading y borde para “sensación” de dado).
    // viewBox 0 0 100 100
    switch (dieId) {
      case 'd4':   return '50,8 88,78 12,78';                       // triángulo
      case 'd6':   return '22,14 78,14 86,50 78,86 22,86 14,50';     // hex suave (look “cubo” estilizado)
      case 'd8':   return '50,10 86,50 50,90 14,50';                 // rombo
      case 'd10':  return '50,6 76,20 90,50 76,80 50,94 24,80 10,50 24,20'; // octógono “gem”
      case 'd12':  return '50,6 78,18 92,42 84,70 60,92 40,92 16,70 8,42 22,18'; // enneágono-ish
      case 'd20':  return '50,4 82,18 96,44 88,74 58,96 42,96 12,74 4,44 18,18'; // enneágono-ish
      case 'd100': return '50,6 80,18 94,44 88,72 60,94 40,94 12,72 6,44 20,18'; // parecido a d20
      default:     return '50,10 86,50 50,90 14,50';
    }
  }

  function createDieSvg(dieId) {
    const points = diePolygonPoints(dieId);
    return [
      '<svg class="rd-die__svg" viewBox="0 0 100 100" aria-hidden="true">',
      '  <polygon class="rd-die__shape" points="' + points + '" />',
      '  <polyline class="rd-die__edge" points="' + points + '" fill="none" />',
      '</svg>',
    ].join('');
  }

  function toUpperDieLabel(label) {
    // "D" en mayúscula, resto igual (D4, D20, D100)
    const s = String(label || '');
    return s.replace(/^d/i, 'D');
  }

  function buildCatalogSpriteIcon(dieId, valueToShow, idx) {
    if (!window.SpriteDiceRenderer || typeof window.SpriteDiceRenderer.getAtlas !== 'function') return null;
    const atlas = window.SpriteDiceRenderer.getAtlas(String(dieId || '').trim());
    if (!atlas || !atlas.map) return null;
    const cell = atlas.map[valueToShow];
    if (!cell) return null;

    const toPercent = window.SpriteDiceRenderer._toPercent;
    if (!toPercent) return null;
    const uv = toPercent(cell.col, cell.row, atlas.cols, atlas.rows);

    const tintAttrs = getCatalogTintAttrs(idx);
    return [
      '<div class="rd-die rd-die--catalog rd-die--sprite' + (isCatalogTintEnabled() ? ' rd-die--tinted' : '') + '" data-die-id="' + escapeHtml(String(dieId || '').trim()) + '"' + tintAttrs + ' aria-hidden="true">',
      '  <div class="rd-sprite" style="--cols:' + atlas.cols + ';--rows:' + atlas.rows + ';--u:' + uv.u + '%;--v:' + uv.v + '%;--rd-sprite-img:url(' + escapeHtml(atlas.src) + ');background-image:var(--rd-sprite-img);"></div>',
      '</div>',
    ].join('');
  }

  function getColorPrefsSafe() {
    if (!window.RollDiceColorPrefs || typeof window.RollDiceColorPrefs.get !== 'function') {
      return { mode: 'none', fixedColor: '#60a5fa', intensity: 70 };
    }
    return window.RollDiceColorPrefs.get();
  }

  function tintAlphaFromIntensity(intensity) {
    // Escala perceptual suave: 0..100 -> 0..0.85
    const t = clampInt(intensity, 0, 100) / 100;
    return (t * 0.85);
  }

  function wrapHue(h) {
    const x = Number(h);
    if (!Number.isFinite(x)) return 0;
    return ((x % 360) + 360) % 360;
  }

  function getCatalogHueSeed() {
    const KEY = 'rollDice.catalogHueSeed';
    try {
      const raw = localStorage.getItem(KEY);
      const n = parseInt(String(raw || '').trim(), 10);
      if (Number.isFinite(n) && n >= 0 && n <= 359) return n;
    } catch (_) {}
    const seed = Math.floor(Math.random() * 360);
    try { localStorage.setItem(KEY, String(seed)); } catch (_) {}
    return seed;
  }

  function catalogColorForIndex(idx) {
    const GOLDEN_ANGLE = 137.507764;
    const seed = getCatalogHueSeed();
    const hue = wrapHue(seed + (Number(idx || 0) * GOLDEN_ANGLE));
    return 'hsl(' + hue.toFixed(1) + ' 85% 60%)';
  }

  function getCatalogTintAttrs(idx) {
    const prefs = getColorPrefsSafe();
    if (!prefs || prefs.mode === 'none') return '';
    const a = tintAlphaFromIntensity(prefs.intensity);
    // En catálogo: si es random, queremos “un color por icono” (no arcoíris).
    const kind = 'solid';
    const color = (prefs.mode === 'fixed')
      ? prefs.fixedColor
      : (prefs.mode === 'random' ? catalogColorForIndex(idx) : '');
    return (
      ' data-tint="1" data-tint-kind="' + escapeHtml(kind) + '"' +
      (color
        ? (' style="--rd-tint:' + escapeHtml(color) + ';--rd-tint-a:' + escapeHtml(String(a)) + ';"')
        : (' style="--rd-tint-a:' + escapeHtml(String(a)) + ';"'))
    );
  }

  function isCatalogTintEnabled() {
    const prefs = getColorPrefsSafe();
    return !!(prefs && prefs.mode && prefs.mode !== 'none');
  }

  function applyTintToRootDieHtml(html, tintAttrs) {
    if (!tintAttrs) return html;
    const i = html.indexOf('>');
    if (i === -1) return html;
    // Añadir clase + attrs en el primer <div ...>
    let out = html;
    out = out.replace('class="rd-die', 'class="rd-die rd-die--tinted');
    const j = out.indexOf('>');
    if (j === -1) return out;
    return out.slice(0, j) + tintAttrs + out.slice(j);
  }

  function buildCatalogIconHtml(t, idx) {
    // Para d4/d6/d8 usar atlas mostrando el número máximo
    if (t && t.id === 'd100') {
      // Icono consistente por pack (si existe): /assets/sprites/<pack>/d100_icon.png
      try {
        const pack = (window.SpriteDiceRenderer && typeof window.SpriteDiceRenderer.getPack === 'function')
          ? window.SpriteDiceRenderer.getPack()
          : 'crystal';
        const src =
          (String(window.RollDiceAssetBase || './').replace(/\/?$/, '/') || './') +
          'assets/sprites/' +
          encodeURIComponent(pack) +
          '/d100_Icon.png';
        const tintAttrs = getCatalogTintAttrs(idx);
        return [
          '<div class="rd-die rd-die--catalog rd-die--sprite' + (isCatalogTintEnabled() ? ' rd-die--tinted' : '') + '" data-die-id="d100"' + tintAttrs + ' aria-hidden="true">',
          '  <div class="rd-sprite" style="--cols:1;--rows:1;--u:0%;--v:0%;--rd-sprite-img:url(' + escapeHtml(src) + ');background-image:var(--rd-sprite-img);"></div>',
          '</div>',
        ].join('');
      } catch (_) {
        // Fallback
        const tintAttrs = getCatalogTintAttrs(idx);
        return [
          '<div class="rd-die rd-die--catalog rd-die--d100' + (isCatalogTintEnabled() ? ' rd-die--tinted' : '') + '"' + tintAttrs + ' aria-hidden="true">',
          '  <div class="rd-d100-badge">100</div>',
          '</div>',
        ].join('');
      }
    }

    // Para dados con atlas, mostrar el número máximo (caras)
    if (t && (t.id === 'd4' || t.id === 'd6' || t.id === 'd8' || t.id === 'd10' || t.id === 'd12' || t.id === 'd20')) {
      const html = buildCatalogSpriteIcon(t.id, t.sides, idx);
      if (html) return html;
    }
    // Fallback: SVG (mantiene el look para el resto)
    return [
      '<div class="rd-die' + (isCatalogTintEnabled() ? ' rd-die--tinted' : '') + '"' + getCatalogTintAttrs(idx) + ' aria-hidden="true">',
      createDieSvg(t.id),
      '  <div class="rd-die__label">' + escapeHtml(toUpperDieLabel(t.label)) + '</div>',
      '</div>',
    ].join('');
  }

  function getEntityTintAttrs(entity) {
    const prefs = getColorPrefsSafe();
    if (!prefs || prefs.mode === 'none') return '';
    const a = tintAlphaFromIntensity(prefs.intensity);
    if (prefs.mode === 'fixed') {
      return ' data-tint="1" data-tint-kind="solid" style="--rd-tint:' + escapeHtml(prefs.fixedColor) + ';--rd-tint-a:' + escapeHtml(String(a)) + ';"';
    }
    // random: por entidad
    const c = entity && entity.color ? String(entity.color) : '';
    if (!c) return ' data-tint="1" data-tint-kind="solid" style="--rd-tint-a:' + escapeHtml(String(a)) + ';"';
    return ' data-tint="1" data-tint-kind="solid" style="--rd-tint:' + escapeHtml(c) + ';--rd-tint-a:' + escapeHtml(String(a)) + ';"';
  }

  function createTrayDieHtml(roll, idx, entity) {
    const token = (entity && entity.id) ? entity.id : (roll.label + '-' + idx);
    const tintAttrs = getEntityTintAttrs(entity);

    // Sprites (d4/d6/d8, etc): si existe atlas, preferirlo
    if (window.SpriteDiceRenderer && typeof window.SpriteDiceRenderer.render === 'function') {
      const html = window.SpriteDiceRenderer.render({
        dieId: roll.id,
        value: roll.value,
        token: token,
        parts: roll.parts || null,
      });
      if (html) return applyTintToRootDieHtml(html, tintAttrs);
    }

    // d6: cubo 3D real con CSS (Opción A)
    if (roll.id === 'd6' && window.D6CubeRenderer && typeof window.D6CubeRenderer.cubeHtml === 'function') {
      const out = window.D6CubeRenderer.cubeHtml({
        value: roll.value,
        token: token,
      });
      return applyTintToRootDieHtml(out, tintAttrs);
    }

    // resto: SVG actual
    return [
      '<div class="rd-die rd-die--tray rd-die--rolling' + (tintAttrs ? ' rd-die--tinted' : '') + '" data-roll-token="' + escapeHtml(token) + '" data-final-value="' + escapeHtml(String(roll.value)) + '"' + tintAttrs + '>',
      createDieSvg(roll.id),
      '  <div class="rd-die__label">' + escapeHtml(roll.label) + '</div>',
      '  <div class="rd-die__result" aria-label="Resultado">' + escapeHtml(String(roll.value)) + '</div>',
      '</div>',
    ].join('');
  }

  function getCssNumberVar(name, fallback) {
    try {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
      const n = parseInt(String(raw || '').trim(), 10);
      return Number.isFinite(n) ? n : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function spriteSetUv(spriteEl, col, row, cols, rows) {
    const toPercent = window.SpriteDiceRenderer && window.SpriteDiceRenderer._toPercent;
    if (!toPercent) return;
    const uv = toPercent(col, row, cols, rows);
    spriteEl.style.setProperty('--u', uv.u + '%');
    spriteEl.style.setProperty('--v', uv.v + '%');
  }

  function startSpriteShuffle(node, ms) {
    const spriteEls = Array.from(node.querySelectorAll('.rd-sprite'));
    if (!spriteEls.length) return null;

    function makePairs(spriteEl) {
      const cols = parseInt(getComputedStyle(spriteEl).getPropertyValue('--cols').trim(), 10) || 2;
      const rows = parseInt(getComputedStyle(spriteEl).getPropertyValue('--rows').trim(), 10) || 2;
      if (cols <= 0 || rows <= 0) return null;
      const shuffleAttr = spriteEl.getAttribute('data-shuffle') || node.getAttribute('data-shuffle') || '';
      const shufflePairs = shuffleAttr
        ? shuffleAttr.split('|').map(function (p) {
            const parts = p.split(',');
            return {
              col: clampInt(parts[0], 0, cols - 1),
              row: clampInt(parts[1], 0, rows - 1),
            };
          }).filter(function (x) { return Number.isFinite(x.col) && Number.isFinite(x.row); })
        : null;
      return { cols: cols, rows: rows, pairs: shufflePairs };
    }

    // ciclo rápido para simular “rodar” (cambia de cara mientras gira)
    const interval = window.setInterval(function () {
      spriteEls.forEach(function (spriteEl) {
        const info = makePairs(spriteEl);
        if (!info) return;
        let col, row;
        if (info.pairs && info.pairs.length) {
          const pick = info.pairs[Math.floor(Math.random() * info.pairs.length)];
          col = pick.col;
          row = pick.row;
        } else {
          col = Math.floor(Math.random() * info.cols);
          row = Math.floor(Math.random() * info.rows);
        }
        spriteSetUv(spriteEl, col, row, info.cols, info.rows);
      });
    }, clampInt(ms, 40, 250));

    return {
      stop: function () {
        window.clearInterval(interval);
        // aplicar el frame final (por sprite si está disponible)
        spriteEls.forEach(function (spriteEl) {
          const cols = parseInt(getComputedStyle(spriteEl).getPropertyValue('--cols').trim(), 10) || 2;
          const rows = parseInt(getComputedStyle(spriteEl).getPropertyValue('--rows').trim(), 10) || 2;

          // opción A: d4/d6/d8 usan final-col/final-row en el contenedor
          const nodeFinalCol = parseInt(node.getAttribute('data-final-col') || '0', 10) || 0;
          const nodeFinalRow = parseInt(node.getAttribute('data-final-row') || '0', 10) || 0;

          // opción B: d100 usa final-u/final-v por sprite (porcentajes)
          const finalU = spriteEl.getAttribute('data-final-u');
          const finalV = spriteEl.getAttribute('data-final-v');
          if (finalU != null && finalV != null) {
            spriteEl.style.setProperty('--u', String(finalU) + '%');
            spriteEl.style.setProperty('--v', String(finalV) + '%');
            return;
          }

          spriteSetUv(spriteEl, nodeFinalCol, nodeFinalRow, cols, rows);
        });
      },
    };
  }

  function injectSvgDefsOnce() {
    if (document.getElementById('rd-svg-defs')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'rd-svg-defs';
    wrapper.id = 'rd-svg-defs';
    wrapper.innerHTML = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true">',
      '  <defs>',
      '    <linearGradient id="rdDieFill" x1="0" y1="0" x2="1" y2="1">',
      '      <stop offset="0%" stop-color="rgba(255,255,255,0.18)"/>',
      '      <stop offset="35%" stop-color="rgba(255,255,255,0.06)"/>',
      '      <stop offset="70%" stop-color="rgba(0,0,0,0.14)"/>',
      '      <stop offset="100%" stop-color="rgba(0,0,0,0.24)"/>',
      '    </linearGradient>',
      '  </defs>',
      '</svg>',
    ].join('');
    document.body.appendChild(wrapper);
  }

  function DiceRollerUI() {
    if (!window.DiceEngine) {
      throw new Error('DiceRollerUI: falta DiceEngine (js/core/dice-engine.js)');
    }

    injectSvgDefsOnce();

    this.engine = new window.DiceEngine({
      maxDiceTotal: 60,
      maxPerType: 30,
    });

    this.scene = (window.RollDiceTrayScene) ? new window.RollDiceTrayScene({ maxTotal: this.engine.maxDiceTotal || 60 }) : null;

    this.catalogEl = el('rd-dice-catalog');
    this.trayEl = el('rd-tray');
    this.resultsBarEl = el('rd-results-bar');
    this.rollBtn = el('rd-roll');
    this.clearBtn = el('rd-clear-pool');

    this.isRolling = false;
    this.lastRoll = null;

    this.renderCatalog();
    this.renderTrayIdle();
    this.renderResultsEmpty();

    this.bindEvents();
    this.syncButtons();

    // Re-render cuando cambie el pack de sprites
    window.addEventListener('rd:spritePackChange', () => {
      this.renderCatalog();
      this.renderTrayIdle();
    });

    // Re-render cuando cambie el color
    window.addEventListener('rd:colorChange', () => {
      this.renderCatalog();
      this.renderTrayIdle();
      // Nota: si está tirando, respetamos el render actual; el siguiente render aplicará
    });
  }

  DiceRollerUI.prototype.bindEvents = function () {
    const self = this;

    this.catalogEl.addEventListener('click', function (ev) {
      const card = ev.target.closest('[data-die-id]');
      if (!card) return;
      if (self.isRolling) return;

      const dieId = card.getAttribute('data-die-id');
      if (!dieId) return;

      // Si se hace clic en el input, solo enfocar (no modificar cantidad)
      const input = ev.target.closest('input[data-action="set"]');
      if (input) return;

      const actionBtn = ev.target.closest('[data-action]');
      const action = actionBtn ? actionBtn.getAttribute('data-action') : null;

      if (action === 'dec') {
        self.engine.increment(dieId, -1);
      } else {
        // Click en cualquier parte de la card (o botón +) incrementa
        // Respetar límite global (maxDiceTotal)
        const maxTotal = self.engine.maxDiceTotal || 60;
        if (self.engine.getPoolTotalCount() < maxTotal) {
          self.engine.increment(dieId, 1);
        }
      }

      self.renderCatalog();
      self.renderTrayIdle();
      self.syncButtons();
    });

    this.catalogEl.addEventListener('change', function (ev) {
      const input = ev.target && ev.target.closest && ev.target.closest('input[data-action="set"]');
      if (!input) return;
      if (self.isRolling) return;

      const card = input.closest('[data-die-id]');
      if (!card) return;
      const dieId = card.getAttribute('data-die-id');
      if (!dieId) return;

      const raw = String(input.value || '').trim();
      const next = raw === '' ? 0 : clampInt(raw, 0, self.engine.maxPerType || 30);
      self.engine.setCount(dieId, next);

      self.renderCatalog();
      self.renderTrayIdle();
      self.syncButtons();
    });

    // Tirar desde la bandeja (solo si no está tirando)
    this.trayEl.addEventListener('click', function () {
      if (self.isRolling) return;
      if (self.engine.getPoolTotalCount() <= 0) return;
      self.startRoll();
    });

    this.clearBtn.addEventListener('click', function () {
      if (self.isRolling) return;
      self.engine.clearPool();
      self.lastRoll = null;
      self.renderCatalog();
      self.renderTrayIdle();
      self.renderResultsEmpty();
      self.syncButtons();
    });

    this.rollBtn.addEventListener('click', function () {
      if (self.isRolling) return;
      self.startRoll();
    });
  };

  DiceRollerUI.prototype.syncButtons = function () {
    const hasDice = this.engine.getPoolTotalCount() > 0;
    this.rollBtn.disabled = !hasDice || this.isRolling;
    this.clearBtn.disabled = !hasDice || this.isRolling;
  };

  DiceRollerUI.prototype.renderCatalog = function () {
    const types = this.engine.getDiceTypes();
    const snapshot = this.engine.getPoolSnapshot();
    const total = this.engine.getPoolTotalCount();
    const maxTotal = this.engine.maxDiceTotal || 60;
    const maxPerType = this.engine.maxPerType || 30;

    const html = types
      .map(function (t, idx) {
        const count = clampInt(snapshot[t.id] || 0, 0, 999);
        const disableInc = (total >= maxTotal);
        const disableDec = (count <= 0);
        return [
          '<div class="rd-die-card" data-die-id="' + escapeHtml(t.id) + '">',
          buildCatalogIconHtml(t, idx),
          '  <div class="rd-die-card__meta">',
          '    <div class="rd-catalog-stepper" role="group" aria-label="Cantidad de ' + escapeHtml(toUpperDieLabel(t.label)) + '">',
          '      <button class="rd-catalog-stepper__btn" type="button" data-action="dec" ' + (disableDec ? 'disabled' : '') + '>−</button>',
          '      <input class="rd-catalog-stepper__input" data-action="set" inputmode="numeric" pattern="[0-9]*" type="number" min="0" max="' + escapeHtml(String(maxPerType)) + '" value="' + escapeHtml(String(count)) + '" />',
          '      <button class="rd-catalog-stepper__btn" type="button" data-action="inc" ' + (disableInc ? 'disabled' : '') + '>+</button>',
          '    </div>',
          '  </div>',
          '</div>',
        ].join('');
      })
      .join('');
    this.catalogEl.innerHTML = html;
    if (window.SpriteCanvasTintApplier && typeof window.SpriteCanvasTintApplier.applyAll === 'function') {
      window.SpriteCanvasTintApplier.applyAll(this.catalogEl);
    }
  };

  DiceRollerUI.prototype.renderPool = function () {
    // Pool UI eliminado (catálogo + bandeja cubren esta necesidad).
  };

  DiceRollerUI.prototype.renderTrayIdle = function () {
    const snapshot = this.engine.getPoolSnapshot();
    const types = this.engine.getDiceTypes();

    // Sincronizar entidades (para color random persistente)
    const prefs = getColorPrefsSafe();
    const entities = this.scene
      ? this.scene.syncToPool(snapshot, types, prefs)
      : (function () {
          const out = [];
          for (let i = 0; i < types.length; i++) {
            const t = types[i];
            const count = clampInt(snapshot[t.id] || 0, 0, 999);
            for (let k = 0; k < count; k++) out.push({ id: t.id + '-idle-' + i + '-' + k, dieId: t.id, color: null });
          }
          return out;
        })();

    if (!entities.length) {
      this.trayEl.innerHTML = '<div class="rd-pool__empty">Agrega dados y pulsa la bandeja para tirar.</div>';
      if (window.SpriteCanvasTintApplier && typeof window.SpriteCanvasTintApplier.applyAll === 'function') {
        window.SpriteCanvasTintApplier.applyAll(this.trayEl);
      }
      return;
    }

    const html = entities.map(function (e, idx) {
      const dieId = e.dieId;
      const tintAttrs = getEntityTintAttrs(e);
      // Preferir sprites en idle; fallback a SVG si no hay atlas
      if (window.SpriteDiceRenderer && typeof window.SpriteDiceRenderer.renderIdle === 'function') {
        const out = window.SpriteDiceRenderer.renderIdle({ dieId: dieId, token: e.id });
        if (out) return applyTintToRootDieHtml(out, tintAttrs);
      }
      return [
        '<div class="rd-die rd-die--tray' + (tintAttrs ? ' rd-die--tinted' : '') + '"' + tintAttrs + ' aria-hidden="true">',
        createDieSvg(dieId),
        '  <div class="rd-die__label">' + escapeHtml(toUpperDieLabel(dieId)) + '</div>',
        '</div>',
      ].join('');
    }).join('');

    this.trayEl.innerHTML = html;
    if (window.SpriteCanvasTintApplier && typeof window.SpriteCanvasTintApplier.applyAll === 'function') {
      window.SpriteCanvasTintApplier.applyAll(this.trayEl);
    }
  };

  DiceRollerUI.prototype.renderResultsEmpty = function () {
    this.resultsBarEl.innerHTML = '<div class="rd-results-empty">Sin resultados todavía.</div>';
  };

  DiceRollerUI.prototype.startRoll = function () {
    const self = this;
    const totalDice = this.engine.getPoolTotalCount();
    if (totalDice <= 0) return;

    this.isRolling = true;
    this.syncButtons();

    const result = this.engine.roll();
    this.lastRoll = result;

    const types = this.engine.getDiceTypes();
    const entities = this.scene
      ? this.scene.syncToPool(this.engine.getPoolSnapshot(), types, getColorPrefsSafe())
      : null;

    // Render bandeja con el mismo orden que los rolls
    this.trayEl.innerHTML = result.rolls
      .map(function (r, idx) {
        const e = entities ? entities[idx] : null;
        return createTrayDieHtml(r, idx, e);
      })
      .join('');
    if (window.SpriteCanvasTintApplier && typeof window.SpriteCanvasTintApplier.applyAll === 'function') {
      window.SpriteCanvasTintApplier.applyAll(this.trayEl);
    }

    // Desenlazar el “vacío” si no hay dados
    if (result.rolls.length === 0) {
      this.renderTrayEmpty();
      this.renderResultsEmpty();
      this.isRolling = false;
      this.syncButtons();
      return;
    }

    // Animación escalonada
    const rollMs = getCssNumberVar('--rd-roll-ms', 1800);
    const base = rollMs;          // cuando “asienta” cada dado
    const step = 110;             // escalonado más pausado
    const maxWait = rollMs + 900; // tope para no alargar demasiado con muchos dados
    const totalWait = Math.min(maxWait, base + (result.rolls.length - 1) * step);

    const diceNodes = Array.from(this.trayEl.querySelectorAll('.rd-die--tray'));
    const physics = (window.TrayPhysics && typeof window.TrayPhysics.run === 'function')
      ? window.TrayPhysics.run({
          trayEl: this.trayEl,
          diceNodes: diceNodes,
          durationMs: totalWait + 450,
        })
      : null;

    diceNodes.forEach(function (node, idx) {
      const delay = Math.min(900, idx * step);
      node.style.animationDelay = delay + 'ms';
      const svg = node.querySelector('.rd-die__svg');
      if (svg) svg.style.animationDelay = delay + 'ms';
      const cubeBody = node.querySelector('.rd-cube__body');
      if (cubeBody) cubeBody.style.animationDelay = delay + 'ms';

      // d4 sprite: shuffle durante rolling, y al final fijar valor
      const spriteController = node.classList.contains('rd-die--sprite')
        ? startSpriteShuffle(node, 170)
        : null;

      window.setTimeout(function () {
        if (spriteController) spriteController.stop();
        node.classList.remove('rd-die--rolling');
        node.classList.add('rd-die--has-result');

        // Para dados SVG, mostrar el valor final en el centro (en vez de la burbuja)
        const finalValue = node.getAttribute('data-final-value');
        if (finalValue) {
          const label = node.querySelector('.rd-die__label');
          if (label) label.textContent = String(finalValue);
        }
      }, base + delay);
    });

    window.setTimeout(function () {
      self.isRolling = false;
      self.syncButtons();
      self.renderResults(result);
      if (physics && typeof physics.stop === 'function') physics.stop({ settle: true, settleMs: 520 });
    }, totalWait + 450);
  };

  DiceRollerUI.prototype.renderResults = function (result) {
    const byType = Array.isArray(result.byType) ? result.byType : [];
    if (!byType.length) {
      this.resultsBarEl.innerHTML = '<div class="rd-results-empty">No hay resultados para mostrar.</div>';
      return;
    }

    const blocks = byType.map(function (g) {
      const label = toUpperDieLabel(g.label);
      const values = (g.values || []).map(function (v) {
        return '<span class="rd-results-chip">' + escapeHtml(String(v)) + '</span>';
      }).join('');
      return [
        '<div class="rd-results-cell">',
        '  <span class="rd-results-label">' + escapeHtml(label) + 'x' + escapeHtml(String(g.count)) + ':</span>',
        '  <span class="rd-results-values">' + values + '</span>',
        '  <span class="rd-results-sum">= ' + escapeHtml(String(g.sum)) + '</span>',
        '</div>',
      ].join('');
    }).join('');

    this.resultsBarEl.innerHTML = [
      '<div class="rd-results-grid">',
      blocks,
      '<div class="rd-results-total">Total: ' + escapeHtml(String(result.total)) + '</div>',
      '</div>',
    ].join('');
  };

  // Boot (soporta carga diferida desde Atlas después de DOMContentLoaded)
  function bootRollDice() {
    if (window.__atlasRollDiceBooted) return;
    if (!document.getElementById('rd-dice-catalog')) return;
    window.__atlasRollDiceBooted = true;
    new DiceRollerUI();
    if (window.RollDiceCustomModal && typeof window.RollDiceCustomModal.init === 'function') {
      window.RollDiceCustomModal.init();
    }
  }

  window.RollDiceBoot = bootRollDice;

  // Standalone: arranca solo. En Atlas, dice-page.js llama RollDiceBoot tras montar el DOM.
  if (!window.RollDiceAssetBase) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootRollDice);
    } else {
      bootRollDice();
    }
  }
})();

