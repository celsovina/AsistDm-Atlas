/**
 * TrayScene — entidades de dados (sin DOM)
 * Responsabilidades:
 * - Mantener una lista estable de “dados existentes” según el pool
 * - Asignar color a cada entidad (random por entidad) y conservarlo mientras exista
 * - Definir política de eliminación al reducir conteo: LIFO por tipo
 */
(function () {
  'use strict';

  function clampInt(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    const xi = Math.trunc(x);
    return Math.min(max, Math.max(min, xi));
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function wrapHue(h) {
    const x = Number(h);
    if (!Number.isFinite(x)) return 0;
    return ((x % 360) + 360) % 360;
  }

  function makeId() {
    // id estable por sesión; suficientemente único para este módulo
    return 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  function TrayScene(options) {
    options = options || {};
    this.maxTotal = clampInt(options.maxTotal || 60, 1, 500);
    this.entities = []; // orden de render: d4..d100 y luego por orden de creación (LIFO afecta remoción)
    // Para que "random" no agrupe colores similares, usamos una secuencia bien distribuida.
    this._hueSeed = randInt(0, 359);
    this._colorIndex = 0;
  }

  TrayScene.prototype._nextRandomColor = function () {
    // Golden angle para dispersar tonos
    const GOLDEN_ANGLE = 137.507764;
    const hue = wrapHue(this._hueSeed + (this._colorIndex * GOLDEN_ANGLE));
    this._colorIndex += 1;
    // Pequeña variación para que no se vean “clones”
    const s = randInt(78, 92);
    const l = randInt(52, 66);
    return 'hsl(' + hue.toFixed(1) + ' ' + s + '% ' + l + '%)';
  };

  TrayScene.prototype.getEntities = function () {
    return this.entities.slice();
  };

  TrayScene.prototype.clear = function () {
    this.entities = [];
    this._colorIndex = 0;
  };

  TrayScene.prototype._entitiesByType = function () {
    const map = Object.create(null);
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      const k = e.dieId;
      if (!map[k]) map[k] = [];
      map[k].push(e);
    }
    return map;
  };

  /**
   * Sincroniza entidades para que coincidan con el snapshot del pool.
   * - typesOrder: [{id:'d4'}, ...] para asegurar orden estable por tipo
   * - colorPrefs: {mode, fixedColor, intensity} para asignar color a nuevas entidades
   */
  TrayScene.prototype.syncToPool = function (poolSnapshot, typesOrder, colorPrefs) {
    poolSnapshot = poolSnapshot || {};
    typesOrder = Array.isArray(typesOrder) ? typesOrder : [];
    colorPrefs = colorPrefs || { mode: 'none', fixedColor: '#60a5fa', intensity: 70 };

    const byType = this._entitiesByType();
    const nextEntities = [];

    // Construimos por orden de tipos, y mantenemos existentes primero (para conservar IDs/colores)
    for (let i = 0; i < typesOrder.length; i++) {
      const dieId = String(typesOrder[i] && typesOrder[i].id || '').trim();
      if (!dieId) continue;
      const desired = clampInt(poolSnapshot[dieId] || 0, 0, this.maxTotal);
      const list = (byType[dieId] || []).slice(); // en orden actual

      // Si sobran, eliminar LIFO (quitar del final)
      while (list.length > desired) list.pop();

      // Si faltan, agregar nuevas entidades
      while (list.length < desired) {
        const e = {
          id: makeId(),
          dieId: dieId,
          // color “nativo” de la entidad: solo lo asignamos si modo random
          color: (colorPrefs.mode === 'random') ? this._nextRandomColor() : null,
          createdAt: Date.now(),
        };
        list.push(e);
      }

      for (let k = 0; k < list.length; k++) nextEntities.push(list[k]);
    }

    // Seguridad: limitar
    if (nextEntities.length > this.maxTotal) nextEntities.length = this.maxTotal;
    this.entities = nextEntities;
    return this.getEntities();
  };

  window.RollDiceTrayScene = TrayScene;
})();

