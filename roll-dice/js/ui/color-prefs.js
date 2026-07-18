/**
 * ColorPrefs — preferencias de color/tint (sin UI, sin DOM)
 * Responsabilidades:
 * - Persistir modo de color + color fijo + intensidad
 * - Exponer getters/setters
 * - Emitir evento global cuando cambie (rd:colorChange)
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'rollDice.colorPrefs';

  const DEFAULTS = {
    mode: 'none',          // 'none' | 'fixed' | 'random'
    fixedColor: '#60a5fa', // azul claro
    intensity: 70,         // 0..100 (aprox. “add layer strength”)
  };

  function clampInt(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    const xi = Math.trunc(x);
    return Math.min(max, Math.max(min, xi));
  }

  function normalizeHex(color, fallback) {
    const s = String(color || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      // #rgb -> #rrggbb
      const r = s[1], g = s[2], b = s[3];
      return ('#' + r + r + g + g + b + b).toLowerCase();
    }
    return String(fallback || DEFAULTS.fixedColor).toLowerCase();
  }

  function safeParse(json) {
    try { return JSON.parse(json); } catch (_) { return null; }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const obj = raw ? safeParse(raw) : null;
      const mode = obj && typeof obj.mode === 'string' ? obj.mode : DEFAULTS.mode;
      const fixedColor = normalizeHex(obj && obj.fixedColor, DEFAULTS.fixedColor);
      const intensity = clampInt(obj && obj.intensity, 0, 100);
      const out = { mode: mode, fixedColor: fixedColor, intensity: intensity };
      if (out.mode !== 'none' && out.mode !== 'fixed' && out.mode !== 'random') out.mode = DEFAULTS.mode;
      return out;
    } catch (_) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function save(prefs) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (_) {}
  }

  function emit(prefs) {
    try {
      window.dispatchEvent(new CustomEvent('rd:colorChange', { detail: Object.assign({}, prefs) }));
    } catch (_) {}
  }

  function get() {
    return load();
  }

  function set(next) {
    const current = load();
    next = next || {};
    const merged = {
      mode: typeof next.mode === 'string' ? next.mode : current.mode,
      fixedColor: normalizeHex(next.fixedColor != null ? next.fixedColor : current.fixedColor, DEFAULTS.fixedColor),
      intensity: clampInt(next.intensity != null ? next.intensity : current.intensity, 0, 100),
    };
    if (merged.mode !== 'none' && merged.mode !== 'fixed' && merged.mode !== 'random') merged.mode = DEFAULTS.mode;
    save(merged);
    emit(merged);
    return merged;
  }

  // Helpers para UI
  function setMode(mode) { return set({ mode: mode }); }
  function setFixedColor(hex) { return set({ fixedColor: hex }); }
  function setIntensity(intensity) { return set({ intensity: intensity }); }

  window.RollDiceColorPrefs = {
    get: get,
    set: set,
    setMode: setMode,
    setFixedColor: setFixedColor,
    setIntensity: setIntensity,
    _DEFAULTS: Object.assign({}, DEFAULTS),
  };
})();

