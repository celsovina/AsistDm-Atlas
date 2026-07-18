/**
 * DiceEngine (standalone) — Lógica pura (sin DOM)
 * Responsabilidades:
 * - Definir tipos de dados (d4, d6, d8, d10, d12, d20, d100)
 * - Gestionar un pool (cantidades por tipo)
 * - Ejecutar tiradas y devolver resultados estructurados
 */
(function () {
  'use strict';

  function clampInt(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    const xi = Math.trunc(x);
    return Math.min(max, Math.max(min, xi));
  }

  function randomIntInclusive(min, max) {
    // min/max inclusivos
    const a = Math.ceil(min);
    const b = Math.floor(max);
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }

  const DICE_TYPES = [
    { id: 'd4', sides: 4, label: 'd4', description: 'Tetraedro' },
    { id: 'd6', sides: 6, label: 'd6', description: 'Cubo' },
    { id: 'd8', sides: 8, label: 'd8', description: 'Octaedro' },
    { id: 'd10', sides: 10, label: 'd10', description: 'Pentagonal' },
    { id: 'd12', sides: 12, label: 'd12', description: 'Dodecaedro' },
    { id: 'd20', sides: 20, label: 'd20', description: 'Icosaedro' },
    { id: 'd100', sides: 100, label: 'd100', description: 'Percentil' },
  ];

  function DiceEngine(options) {
    options = options || {};
    this.maxDiceTotal = clampInt(options.maxDiceTotal || 60, 1, 500);
    this.maxPerType = clampInt(options.maxPerType || 30, 1, 200);

    // pool: { [dieId]: count }
    this.pool = Object.create(null);
  }

  DiceEngine.prototype.getDiceTypes = function () {
    return DICE_TYPES.slice();
  };

  DiceEngine.prototype.getPoolSnapshot = function () {
    const out = Object.create(null);
    DICE_TYPES.forEach(function (t) {
      const c = Number(out[t.id] || 0);
      void c;
    });
    for (const k in this.pool) {
      if (Object.prototype.hasOwnProperty.call(this.pool, k)) {
        out[k] = this.pool[k];
      }
    }
    return out;
  };

  DiceEngine.prototype.getPoolTotalCount = function () {
    let total = 0;
    for (const k in this.pool) {
      if (Object.prototype.hasOwnProperty.call(this.pool, k)) {
        total += clampInt(this.pool[k], 0, this.maxPerType);
      }
    }
    return total;
  };

  DiceEngine.prototype.clearPool = function () {
    this.pool = Object.create(null);
  };

  DiceEngine.prototype.setCount = function (dieId, count) {
    const type = this._getTypeOrThrow(dieId);
    const c = clampInt(count, 0, this.maxPerType);

    if (c <= 0) {
      delete this.pool[type.id];
      return;
    }

    // limitar por total
    const current = clampInt(this.pool[type.id] || 0, 0, this.maxPerType);
    const totalWithout = this.getPoolTotalCount() - current;
    const allowed = clampInt(this.maxDiceTotal - totalWithout, 0, this.maxPerType);
    const finalCount = Math.min(c, allowed);

    if (finalCount <= 0) {
      delete this.pool[type.id];
      return;
    }

    this.pool[type.id] = finalCount;
  };

  DiceEngine.prototype.increment = function (dieId, delta) {
    const type = this._getTypeOrThrow(dieId);
    const current = clampInt(this.pool[type.id] || 0, 0, this.maxPerType);
    this.setCount(type.id, current + clampInt(delta, -this.maxPerType, this.maxPerType));
  };

  DiceEngine.prototype.roll = function () {
    const expanded = this._expandPoolToDice();
    const rolls = [];
    let total = 0;

    for (let i = 0; i < expanded.length; i++) {
      const die = expanded[i];
      // d100: percentil (decenas + unidades) para render por sprites
      if (die.id === 'd100') {
        const tens = randomIntInclusive(0, 9) * 10;      // 00..90
        const ones = randomIntInclusive(1, 10);          // 1..10 (se suma tal cual)
        const pct = (tens === 0) ? 100 : (tens + ones);
        total += pct;
        rolls.push({
          id: die.id,
          sides: die.sides,
          label: die.label,
          value: pct,
          parts: { tens: tens, ones: ones },
        });
      } else {
        const value = randomIntInclusive(1, die.sides);
        total += value;
        rolls.push({
          id: die.id,
          sides: die.sides,
          label: die.label,
          value: value,
        });
      }
    }

    return {
      total: total,
      rolls: rolls,
      byType: groupByType(rolls),
      timestamp: Date.now(),
    };
  };

  DiceEngine.prototype._expandPoolToDice = function () {
    const out = [];

    for (let i = 0; i < DICE_TYPES.length; i++) {
      const t = DICE_TYPES[i];
      const count = clampInt(this.pool[t.id] || 0, 0, this.maxPerType);
      for (let k = 0; k < count; k++) {
        out.push({
          id: t.id,
          sides: t.sides,
          label: t.label,
        });
      }
    }

    // limitar por seguridad
    if (out.length > this.maxDiceTotal) {
      out.length = this.maxDiceTotal;
    }

    return out;
  };

  DiceEngine.prototype._getTypeOrThrow = function (dieId) {
    const id = String(dieId || '').trim();
    const t = DICE_TYPES.find(function (x) { return x.id === id; });
    if (!t) throw new Error('DiceEngine: tipo de dado inválido: ' + id);
    return t;
  };

  function groupByType(rolls) {
    const map = Object.create(null);
    for (let i = 0; i < rolls.length; i++) {
      const r = rolls[i];
      const key = r.label;
      if (!map[key]) {
        map[key] = { label: r.label, sides: r.sides, values: [], sum: 0, count: 0 };
      }
      map[key].values.push(r.value);
      map[key].sum += r.value;
      map[key].count += 1;
    }

    // devolver en orden: d4..d100 según DICE_TYPES
    const ordered = [];
    for (let j = 0; j < DICE_TYPES.length; j++) {
      const t = DICE_TYPES[j];
      const entry = map[t.label];
      if (entry) ordered.push(entry);
    }
    return ordered;
  }

  window.DiceEngine = DiceEngine;
})();
