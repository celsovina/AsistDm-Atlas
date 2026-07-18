/**
 * Helpers de uso local (slots) — la resolución de recursos viene de /api/resources.
 */

/**
 * @param {object[]} resources
 */
export function createFreshUsage(resources) {
  /** @type {Record<string, unknown>} */
  const usage = {};
  for (const res of resources) {
    if (res.kind === 'spellSlots') {
      /** @type {Record<string, boolean[]>} */
      const slots = {};
      for (const lv of res.levels || []) {
        slots[String(lv.spellLevel)] = Array.from(
          { length: lv.count },
          () => false
        );
      }
      usage.spells = slots;
    } else if (res.kind === 'arcanum') {
      /** @type {Record<string, boolean>} */
      const map = {};
      for (const e of res.entries || []) {
        map[String(e.spellLevel)] = false;
      }
      usage[res.id] = map;
    } else if (res.infinite) {
      usage[res.id] = { infinite: true };
    } else {
      usage[res.id] = Array.from({ length: res.count || 0 }, () => false);
    }
  }
  return usage;
}

/**
 * @param {object[]} resources
 * @param {object} prevUsage
 */
export function reconcileUsage(resources, prevUsage) {
  const fresh = createFreshUsage(resources);
  if (!prevUsage || typeof prevUsage !== 'object') return fresh;

  for (const res of resources) {
    const prevKey = res.kind === 'spellSlots' ? 'spells' : res.id;
    const prev = prevUsage[prevKey];

    if (res.kind === 'spellSlots' && prev && typeof prev === 'object') {
      const slots = /** @type {Record<string, boolean[]>} */ (fresh.spells);
      for (const lv of res.levels || []) {
        const key = String(lv.spellLevel);
        const prevRow = Array.isArray(prev[key]) ? prev[key] : [];
        slots[key] = Array.from({ length: lv.count }, (_, i) => !!prevRow[i]);
      }
    } else if (res.kind === 'arcanum' && prev && typeof prev === 'object') {
      const map = /** @type {Record<string, boolean>} */ (fresh[res.id]);
      for (const e of res.entries || []) {
        const key = String(e.spellLevel);
        if (prev[key]) map[key] = true;
      }
    } else if (Array.isArray(prev) && Array.isArray(fresh[res.id])) {
      fresh[res.id] = Array.from(
        { length: res.count || 0 },
        (_, i) => !!prev[i]
      );
    }
  }
  return fresh;
}
