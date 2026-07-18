/**
 * SpriteDiceRenderer — presentación por spritesheet/atlas (sin lógica de tiradas)
 * Responsabilidades:
 * - Dado un tipo (d4) y valor final, renderizar la celda correcta del atlas
 * - Mantener el mapeo configurable por dado
 */
(function () {
  'use strict';

  const STORAGE_KEY_PACK = 'rollDice.spritePack';
  const DEFAULT_PACK = 'crystal';

  function clampInt(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    const xi = Math.trunc(x);
    return Math.min(max, Math.max(min, xi));
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toPercent(col, row, cols, rows) {
    const u = (clampInt(col, 0, cols - 1) / Math.max(1, cols - 1)) * 100;
    const v = (clampInt(row, 0, rows - 1) / Math.max(1, rows - 1)) * 100;
    return { u: u, v: v };
  }

  function randomCell(cols, rows) {
    const c = clampInt(Math.floor(Math.random() * cols), 0, cols - 1);
    const r = clampInt(Math.floor(Math.random() * rows), 0, rows - 1);
    return { col: c, row: r };
  }

  function getPack() {
    try {
      const v = String(localStorage.getItem(STORAGE_KEY_PACK) || '').trim();
      return v || DEFAULT_PACK;
    } catch (_) {
      return DEFAULT_PACK;
    }
  }

  function setPack(packName) {
    const next = String(packName || '').trim() || DEFAULT_PACK;
    try {
      localStorage.setItem(STORAGE_KEY_PACK, next);
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent('rd:spritePackChange', { detail: { pack: next } }));
    } catch (_) {}
    return next;
  }

  function assetBase() {
    const raw = String(window.RollDiceAssetBase || './').trim() || './';
    return raw.replace(/\/?$/, '/');
  }

  function spriteUrl(file) {
    const pack = getPack();
    return (
      assetBase() +
      'assets/sprites/' +
      encodeURIComponent(pack) +
      '/' +
      String(file || '')
    );
  }

  // Config
  // Nota: el "map" define qué celda corresponde a cada valor final.
  // "shuffleValues" (opcional) define qué valores se usan durante la animación (para evitar celdas “vacías”).
  const ATLAS = {
    d4: {
      file: 'd4_atlas.png',
      cols: 2,
      rows: 2,
      shuffleValues: [1, 2, 3, 4],
      map: {
        1: { col: 0, row: 0 },
        2: { col: 1, row: 0 },
        3: { col: 0, row: 1 },
        4: { col: 1, row: 1 },
      },
    },
    // d6 atlas 3x2: 1,2,3 / 4,5,6
    d6: {
      file: 'd6_atlas.png',
      cols: 3,
      rows: 2,
      shuffleValues: [1, 2, 3, 4, 5, 6],
      map: {
        1: { col: 0, row: 0 },
        2: { col: 1, row: 0 },
        3: { col: 2, row: 0 },
        4: { col: 0, row: 1 },
        5: { col: 1, row: 1 },
        6: { col: 2, row: 1 },
      },
    },
    // d8 atlas 3x3: 1..8 en orden fila-major, el 9 es “extra” (no se usa)
    d8: {
      file: 'd8_atlas.png',
      cols: 3,
      rows: 3,
      shuffleValues: [1, 2, 3, 4, 5, 6, 7, 8],
      map: {
        1: { col: 0, row: 0 },
        2: { col: 1, row: 0 },
        3: { col: 2, row: 0 },
        4: { col: 0, row: 1 },
        5: { col: 1, row: 1 },
        6: { col: 2, row: 1 },
        7: { col: 0, row: 2 },
        8: { col: 1, row: 2 },
        // 9: { col: 2, row: 2 }  // reservado / no se usa
      },
    },

    // d10/d12 en atlas 4x3 (tile 512 -> 2048x1536)
    // Orden fila-major: 1..12
    d10: {
      file: 'd10_atlas.png',
      cols: 4,
      rows: 3,
      shuffleValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      map: {
        1: { col: 0, row: 0 }, 2: { col: 1, row: 0 }, 3: { col: 2, row: 0 }, 4: { col: 3, row: 0 },
        5: { col: 0, row: 1 }, 6: { col: 1, row: 1 }, 7: { col: 2, row: 1 }, 8: { col: 3, row: 1 },
        9: { col: 0, row: 2 }, 10: { col: 1, row: 2 },
        // alias útil para percentiles si tu d10 muestra 0 como "10"
        0: { col: 1, row: 2 },
      },
    },
    d12: {
      file: 'd12_atlas.png',
      cols: 4,
      rows: 3,
      shuffleValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      map: {
        1: { col: 0, row: 0 }, 2: { col: 1, row: 0 }, 3: { col: 2, row: 0 }, 4: { col: 3, row: 0 },
        5: { col: 0, row: 1 }, 6: { col: 1, row: 1 }, 7: { col: 2, row: 1 }, 8: { col: 3, row: 1 },
        9: { col: 0, row: 2 }, 10: { col: 1, row: 2 }, 11: { col: 2, row: 2 }, 12: { col: 3, row: 2 },
      },
    },

    // d20 en atlas 5x4 (tile 512 -> 2560x2048)
    d20: {
      file: 'd20_atlas.png',
      cols: 5,
      rows: 4,
      shuffleValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      map: {
        1: { col: 0, row: 0 }, 2: { col: 1, row: 0 }, 3: { col: 2, row: 0 }, 4: { col: 3, row: 0 }, 5: { col: 4, row: 0 },
        6: { col: 0, row: 1 }, 7: { col: 1, row: 1 }, 8: { col: 2, row: 1 }, 9: { col: 3, row: 1 }, 10: { col: 4, row: 1 },
        11: { col: 0, row: 2 }, 12: { col: 1, row: 2 }, 13: { col: 2, row: 2 }, 14: { col: 3, row: 2 }, 15: { col: 4, row: 2 },
        16: { col: 0, row: 3 }, 17: { col: 1, row: 3 }, 18: { col: 2, row: 3 }, 19: { col: 3, row: 3 }, 20: { col: 4, row: 3 },
      },
    },

    // Percentil (decenas) en atlas 4x3. Valores: 0,10..90 (0 = "00")
    // Orden según tu sprite: 10,20,30,40 / 50,60,70,80 / 90,00
    d100_tens: {
      file: 'd100_atlas.png',
      cols: 4,
      rows: 3,
      shuffleValues: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
      map: {
        10: { col: 0, row: 0 },
        20: { col: 1, row: 0 },
        30: { col: 2, row: 0 },
        40: { col: 3, row: 0 },
        50: { col: 0, row: 1 },
        60: { col: 1, row: 1 },
        70: { col: 2, row: 1 },
        80: { col: 3, row: 1 },
        90: { col: 0, row: 2 },
        0: { col: 1, row: 2 },   // 00
      },
    },
  };

  function buildShuffleCells(cfg) {
    const values = Array.isArray(cfg.shuffleValues) && cfg.shuffleValues.length ? cfg.shuffleValues : null;
    if (!values) return null;
    const parts = [];
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      const cell = cfg.map[v];
      if (!cell) continue;
      parts.push(String(cell.col) + ',' + String(cell.row));
    }
    return parts.length ? parts.join('|') : null;
  }

  function render(options) {
    options = options || {};
    const dieId = String(options.dieId || '').trim();
    const value = clampInt(options.value, 0, 9999);
    const token = String(options.token || '');
    const parts = options.parts || null;

    // d100: renderiza dos sprites (decenas + unidades)
    if (dieId === 'd100') {
      if (!parts || typeof parts.tens !== 'number' || typeof parts.ones !== 'number') return null;
      const tensCfg = ATLAS.d100_tens;
      const onesCfg = ATLAS.d10; // unidades usan el atlas del d10
      if (!tensCfg || !onesCfg) return null;

      const tensCell = tensCfg.map[parts.tens];
      const onesCell = onesCfg.map[parts.ones];
      if (!tensCell || !onesCell) return null;

      const tensShuffle = buildShuffleCells(tensCfg);
      const onesShuffle = buildShuffleCells(onesCfg);

      const tensInit = tensShuffle ? (function () {
        const cells = tensShuffle.split('|');
        const pick = cells[Math.floor(Math.random() * cells.length)] || '0,0';
        const pair = pick.split(',');
        return { col: clampInt(pair[0], 0, tensCfg.cols - 1), row: clampInt(pair[1], 0, tensCfg.rows - 1) };
      })() : randomCell(tensCfg.cols, tensCfg.rows);
      const onesInit = onesShuffle ? (function () {
        const cells = onesShuffle.split('|');
        const pick = cells[Math.floor(Math.random() * cells.length)] || '0,0';
        const pair = pick.split(',');
        return { col: clampInt(pair[0], 0, onesCfg.cols - 1), row: clampInt(pair[1], 0, onesCfg.rows - 1) };
      })() : randomCell(onesCfg.cols, onesCfg.rows);

      const tensInitUv = toPercent(tensInit.col, tensInit.row, tensCfg.cols, tensCfg.rows);
      const onesInitUv = toPercent(onesInit.col, onesInit.row, onesCfg.cols, onesCfg.rows);

      const tensFinalUv = toPercent(tensCell.col, tensCell.row, tensCfg.cols, tensCfg.rows);
      const onesFinalUv = toPercent(onesCell.col, onesCell.row, onesCfg.cols, onesCfg.rows);

      return [
        '<div class="rd-die rd-die--tray rd-die--sprite rd-die--rolling rd-die--percent" data-roll-token="' + escapeHtml(token) + '">',
        '  <div class="rd-die--percent__row" aria-hidden="true">',
        '    <div class="rd-sprite rd-sprite--tens" data-final-u="' + escapeHtml(String(tensFinalUv.u)) + '" data-final-v="' + escapeHtml(String(tensFinalUv.v)) + '"' + (tensShuffle ? (' data-shuffle="' + escapeHtml(tensShuffle) + '"') : '') + ' style="--cols:' + tensCfg.cols + ';--rows:' + tensCfg.rows + ';--u:' + tensInitUv.u + '%;--v:' + tensInitUv.v + '%;--rd-sprite-img:url(' + escapeHtml(spriteUrl(tensCfg.file)) + ');background-image:var(--rd-sprite-img);"></div>',
        '    <div class="rd-sprite rd-sprite--ones" data-final-u="' + escapeHtml(String(onesFinalUv.u)) + '" data-final-v="' + escapeHtml(String(onesFinalUv.v)) + '"' + (onesShuffle ? (' data-shuffle="' + escapeHtml(onesShuffle) + '"') : '') + ' style="--cols:' + onesCfg.cols + ';--rows:' + onesCfg.rows + ';--u:' + onesInitUv.u + '%;--v:' + onesInitUv.v + '%;--rd-sprite-img:url(' + escapeHtml(spriteUrl(onesCfg.file)) + ');background-image:var(--rd-sprite-img);"></div>',
        '  </div>',
        '</div>',
      ].join('');
    }

    const cfg = ATLAS[dieId];
    if (!cfg) return null;
    const cell = cfg.map[value];
    if (!cell) return null;

    // Importante:
    // - Durante “rolling” NO mostramos el frame final (para que no se vea “fijo” desde el inicio).
    // - El controlador de UI hará shuffle cambiando u/v, y al finalizar aplicará la celda final.
    const shuffleCells = buildShuffleCells(cfg);
    const initial = shuffleCells ? (function () {
      const cells = shuffleCells.split('|');
      const pick = cells[Math.floor(Math.random() * cells.length)] || '0,0';
      const pair = pick.split(',');
      return { col: clampInt(pair[0], 0, cfg.cols - 1), row: clampInt(pair[1], 0, cfg.rows - 1) };
    })() : randomCell(cfg.cols, cfg.rows);
    const initialUv = toPercent(initial.col, initial.row, cfg.cols, cfg.rows);

    return [
      '<div class="rd-die rd-die--tray rd-die--sprite rd-die--rolling" data-roll-token="' + escapeHtml(token) + '" data-die-id="' + escapeHtml(dieId) + '" data-final-col="' + escapeHtml(String(cell.col)) + '" data-final-row="' + escapeHtml(String(cell.row)) + '"' + (shuffleCells ? (' data-shuffle="' + escapeHtml(shuffleCells) + '"') : '') + '>',
      '  <div class="rd-sprite" style="--cols:' + cfg.cols + ';--rows:' + cfg.rows + ';--u:' + initialUv.u + '%;--v:' + initialUv.v + '%;--rd-sprite-img:url(' + escapeHtml(spriteUrl(cfg.file)) + ');background-image:var(--rd-sprite-img);" aria-hidden="true"></div>',
      '  <div class="rd-die__result" aria-label="Resultado">' + escapeHtml(String(value)) + '</div>',
      '</div>',
    ].join('');
  }

  function renderIdle(options) {
    options = options || {};
    const dieId = String(options.dieId || '').trim();
    const token = String(options.token || '');

    if (dieId === 'd100') {
      const tensCfg = ATLAS.d100_tens;
      const onesCfg = ATLAS.d10;
      if (!tensCfg || !onesCfg) return null;

      const tensShuffle = buildShuffleCells(tensCfg);
      const onesShuffle = buildShuffleCells(onesCfg);

      const tensInit = tensShuffle ? (function () {
        const cells = tensShuffle.split('|');
        const pick = cells[Math.floor(Math.random() * cells.length)] || '0,0';
        const pair = pick.split(',');
        return { col: clampInt(pair[0], 0, tensCfg.cols - 1), row: clampInt(pair[1], 0, tensCfg.rows - 1) };
      })() : randomCell(tensCfg.cols, tensCfg.rows);
      const onesInit = onesShuffle ? (function () {
        const cells = onesShuffle.split('|');
        const pick = cells[Math.floor(Math.random() * cells.length)] || '0,0';
        const pair = pick.split(',');
        return { col: clampInt(pair[0], 0, onesCfg.cols - 1), row: clampInt(pair[1], 0, onesCfg.rows - 1) };
      })() : randomCell(onesCfg.cols, onesCfg.rows);

      const tensInitUv = toPercent(tensInit.col, tensInit.row, tensCfg.cols, tensCfg.rows);
      const onesInitUv = toPercent(onesInit.col, onesInit.row, onesCfg.cols, onesCfg.rows);

      return [
        '<div class="rd-die rd-die--tray rd-die--sprite rd-die--percent" data-roll-token="' + escapeHtml(token) + '">',
        '  <div class="rd-die--percent__row" aria-hidden="true">',
        '    <div class="rd-sprite rd-sprite--tens" style="--cols:' + tensCfg.cols + ';--rows:' + tensCfg.rows + ';--u:' + tensInitUv.u + '%;--v:' + tensInitUv.v + '%;--rd-sprite-img:url(' + escapeHtml(spriteUrl(tensCfg.file)) + ');background-image:var(--rd-sprite-img);"></div>',
        '    <div class="rd-sprite rd-sprite--ones" style="--cols:' + onesCfg.cols + ';--rows:' + onesCfg.rows + ';--u:' + onesInitUv.u + '%;--v:' + onesInitUv.v + '%;--rd-sprite-img:url(' + escapeHtml(spriteUrl(onesCfg.file)) + ');background-image:var(--rd-sprite-img);"></div>',
        '  </div>',
        '</div>',
      ].join('');
    }

    const cfg = ATLAS[dieId];
    if (!cfg) return null;

    const shuffleCells = buildShuffleCells(cfg);
    const initial = shuffleCells ? (function () {
      const cells = shuffleCells.split('|');
      const pick = cells[Math.floor(Math.random() * cells.length)] || '0,0';
      const pair = pick.split(',');
      return { col: clampInt(pair[0], 0, cfg.cols - 1), row: clampInt(pair[1], 0, cfg.rows - 1) };
    })() : randomCell(cfg.cols, cfg.rows);
    const initialUv = toPercent(initial.col, initial.row, cfg.cols, cfg.rows);

    return [
      '<div class="rd-die rd-die--tray rd-die--sprite rd-die--idle" data-roll-token="' + escapeHtml(token) + '" data-die-id="' + escapeHtml(dieId) + '">',
      '  <div class="rd-sprite" style="--cols:' + cfg.cols + ';--rows:' + cfg.rows + ';--u:' + initialUv.u + '%;--v:' + initialUv.v + '%;--rd-sprite-img:url(' + escapeHtml(spriteUrl(cfg.file)) + ');background-image:var(--rd-sprite-img);" aria-hidden="true"></div>',
      '</div>',
    ].join('');
  }

  function getAtlas(dieId) {
    const cfg = ATLAS[String(dieId || '').trim()];
    if (!cfg) return null;
    return Object.assign({}, cfg, { src: spriteUrl(cfg.file) });
  }

  window.SpriteDiceRenderer = {
    render: render,
    renderIdle: renderIdle,
    getPack: getPack,
    setPack: setPack,
    getAtlas: getAtlas,
    _ATLAS: ATLAS, // útil para ajustar mapeos rápido en pruebas
    _toPercent: toPercent,
  };
})();

