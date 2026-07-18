/**
 * ColorEditorUI — UI del editor de colores (vive dentro del modal)
 * Responsabilidades:
 * - Renderizar/leer controles (modo, color fijo, intensidad)
 * - Escribir preferencias via RollDiceColorPrefs
 * - No toca lógica de tiradas ni render de dados directamente
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

  function clampInt(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    const xi = Math.trunc(x);
    return Math.min(max, Math.max(min, xi));
  }

  function setDisabled(el, disabled) {
    if (!el) return;
    el.disabled = !!disabled;
  }

  function syncControls(root, prefs) {
    const modeNone = qs('input[name="rd-color-mode"][value="none"]', root);
    const modeFixed = qs('input[name="rd-color-mode"][value="fixed"]', root);
    const modeRandom = qs('input[name="rd-color-mode"][value="random"]', root);
    if (modeNone) modeNone.checked = prefs.mode === 'none';
    if (modeFixed) modeFixed.checked = prefs.mode === 'fixed';
    if (modeRandom) modeRandom.checked = prefs.mode === 'random';

    const colorInput = qs('#rd-color-fixed', root);
    if (colorInput) colorInput.value = String(prefs.fixedColor || '#60a5fa');

    const intensity = qs('#rd-color-intensity', root);
    const intensityValue = qs('#rd-color-intensity-value', root);
    if (intensity) intensity.value = String(clampInt(prefs.intensity, 0, 100));
    if (intensityValue) intensityValue.textContent = String(clampInt(prefs.intensity, 0, 100)) + '%';

    const disableFixedColor = prefs.mode !== 'fixed';
    setDisabled(colorInput, disableFixedColor);
  }

  function init(options) {
    options = options || {};
    const root = options.root || document;
    const container = qs('#rd-color-editor', root);
    if (!container) return;
    if (!window.RollDiceColorPrefs) return;

    function refresh() {
      const prefs = window.RollDiceColorPrefs.get();
      syncControls(root, prefs);
    }

    // initial
    refresh();

    on(container, 'change', function (ev) {
      const t = ev.target;
      if (!t) return;

      // modo
      if (t && t.name === 'rd-color-mode') {
        window.RollDiceColorPrefs.setMode(t.value);
        refresh();
        return;
      }

      // color fijo
      if (t && t.id === 'rd-color-fixed') {
        window.RollDiceColorPrefs.setFixedColor(t.value);
        refresh();
        return;
      }
    });

    on(container, 'input', function (ev) {
      const t = ev.target;
      if (!t) return;
      if (t && t.id === 'rd-color-intensity') {
        const v = clampInt(t.value, 0, 100);
        window.RollDiceColorPrefs.setIntensity(v);
        const label = qs('#rd-color-intensity-value', root);
        if (label) label.textContent = String(v) + '%';
      }
    });

    // si cambia por fuera (otro componente), sincronizar UI
    window.addEventListener('rd:colorChange', function () {
      refresh();
    });
  }

  window.RollDiceColorEditorUI = { init: init };
})();

