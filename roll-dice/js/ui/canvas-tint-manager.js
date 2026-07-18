/**
 * CanvasTintManager — tint de sprites preservando alpha (no pinta transparencias)
 * Responsabilidades:
 * - Cargar imágenes (atlas) una vez
 * - Aplicar tint por pixel (overlay/multiply) manteniendo alpha original
 * - Cachear por (srcUrl, color, intensity, mode)
 */
(function () {
  'use strict';

  const _imgCache = new Map();   // srcUrl -> Promise<HTMLImageElement>
  const _tintCache = new Map();  // key -> Promise<dataUrl>

  function loadImage(srcUrl) {
    if (_imgCache.has(srcUrl)) return _imgCache.get(srcUrl);
    const p = new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('No se pudo cargar imagen: ' + srcUrl)); };
      img.src = srcUrl;
    });
    _imgCache.set(srcUrl, p);
    return p;
  }

  function parseRgbString(s) {
    // rgb(a)()
    const m = String(s || '').match(/rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)(?:[,\s\/]+([0-9.]+))?\s*\)/i);
    if (!m) return null;
    return { r: parseFloat(m[1]) | 0, g: parseFloat(m[2]) | 0, b: parseFloat(m[3]) | 0 };
  }

  function parseHex(s) {
    const v = String(s || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) {
      return {
        r: parseInt(v.slice(1, 3), 16),
        g: parseInt(v.slice(3, 5), 16),
        b: parseInt(v.slice(5, 7), 16),
      };
    }
    if (/^#[0-9a-f]{3}$/i.test(v)) {
      const r = v[1], g = v[2], b = v[3];
      return {
        r: parseInt(r + r, 16),
        g: parseInt(g + g, 16),
        b: parseInt(b + b, 16),
      };
    }
    return null;
  }

  const _colorCtx = (function () {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    return c.getContext('2d');
  })();

  function cssColorToRgb(color) {
    const hex = parseHex(color);
    if (hex) return hex;
    const rgb = parseRgbString(color);
    if (rgb) return rgb;
    // usar canvas para normalizar (soporta hsl, nombres, etc.)
    try {
      _colorCtx.fillStyle = '#000';
      _colorCtx.fillStyle = String(color || '').trim();
      const norm = _colorCtx.fillStyle;
      return parseHex(norm) || parseRgbString(norm) || { r: 96, g: 165, b: 250 };
    } catch (_) {
      return { r: 96, g: 165, b: 250 };
    }
  }

  function parseHslHue(color) {
    const m = String(color || '').match(/hsl\(\s*([0-9.]+)/i);
    if (!m) return null;
    const h = parseFloat(m[1]);
    if (!Number.isFinite(h)) return null;
    return ((h % 360) + 360) % 360;
  }

  function normalizeColorForCache(color) {
    // En random mode nuestros colores vienen como hsl(...). Cuantizamos hue para que el cache no explote.
    const h = parseHslHue(color);
    if (h == null) return String(color || '').trim();
    const step = 30; // 12 tonos
    const q = Math.round(h / step) * step;
    return 'hsl(' + (q % 360) + ' 85% 60%)';
  }

  async function tintAtlasToDataUrl(options) {
    options = options || {};
    const srcUrl = String(options.srcUrl || '').trim();
    if (!srcUrl) throw new Error('CanvasTintManager: falta srcUrl');
    const color = normalizeColorForCache(options.color || '#60a5fa');
    // Overlay real requiere lectura de píxeles (getImageData), que en file:// puede fallar.
    // Usamos multiply (que sí soporta canvas compositing) como base estable.
    const mode = 'multiply';
    const intensity = Math.max(0, Math.min(1, Number(options.intensity || 0)));

    // 0 intensity => devolver el original (sin cache)
    if (intensity <= 0) return null;

    const key = [srcUrl, color, String(intensity.toFixed(3)), mode].join('|');
    if (_tintCache.has(key)) return _tintCache.get(key);

    const p = (async function () {
      const img = await loadImage(srcUrl);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      // 1) pintar imagen base
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(img, 0, 0);

      // 2) multiplicar por color (sin leer píxeles)
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = intensity;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);

      // 3) restaurar alpha original del PNG (no cambia transparencias)
      ctx.globalCompositeOperation = 'destination-in';
      ctx.globalAlpha = 1;
      ctx.drawImage(img, 0, 0);

      ctx.globalCompositeOperation = 'source-over';
      return canvas.toDataURL('image/png');
    })();

    _tintCache.set(key, p);
    return p;
  }

  window.CanvasTintManager = {
    tintAtlasToDataUrl: tintAtlasToDataUrl,
    _normalizeColorForCache: normalizeColorForCache,
  };
})();

