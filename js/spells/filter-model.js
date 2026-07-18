/**
 * Definiciones y lógica de filtrado de conjuros (Atlas).
 * Dentro de un grupo: OR. Entre grupos: AND.
 * Grupo vacío = no aplica.
 */

export const CLASS_OPTIONS = [
  { id: 'mago', label: 'Mago' },
  { id: 'clerigo', label: 'Clérigo' },
  { id: 'bardo', label: 'Bardo' },
  { id: 'druida', label: 'Druida' },
  { id: 'hechicero', label: 'Hechicero' },
  { id: 'brujo', label: 'Brujo' },
  { id: 'explorador', label: 'Explorador' },
  { id: 'paladin', label: 'Paladín' },
];

export const LEVEL_OPTIONS = [
  { id: '0', label: 'Truco' },
  { id: '1', label: 'Nivel 1' },
  { id: '2', label: 'Nivel 2' },
  { id: '3', label: 'Nivel 3' },
  { id: '4', label: 'Nivel 4' },
  { id: '5', label: 'Nivel 5' },
  { id: '6', label: 'Nivel 6' },
  { id: '7', label: 'Nivel 7' },
  { id: '8', label: 'Nivel 8' },
  { id: '9', label: 'Nivel 9' },
];

export const SCHOOL_OPTIONS = [
  { id: 'Abjuración', label: 'Abjuración' },
  { id: 'Adivinación', label: 'Adivinación' },
  { id: 'Conjuración', label: 'Conjuración' },
  { id: 'Encantamiento', label: 'Encantamiento' },
  { id: 'Evocación', label: 'Evocación' },
  { id: 'Ilusión', label: 'Ilusión' },
  { id: 'Nigromancia', label: 'Nigromancia' },
  { id: 'Transmutación', label: 'Transmutación' },
];

export const CAST_OPTIONS = [
  { id: 'accion', label: '1 acción' },
  { id: 'bonus', label: '1 acción adicional' },
  { id: 'reaccion', label: '1 reacción' },
  { id: '1min', label: '1 minuto' },
  { id: '10min', label: '10 minutos' },
  { id: '1hora+', label: '1 hora o más' },
];

export const SAVE_OPTIONS = [
  { id: 'Fuerza', label: 'Fuerza' },
  { id: 'Destreza', label: 'Destreza' },
  { id: 'Constitución', label: 'Constitución' },
  { id: 'Inteligencia', label: 'Inteligencia' },
  { id: 'Sabiduría', label: 'Sabiduría' },
  { id: 'Carisma', label: 'Carisma' },
  { id: 'none', label: 'Sin salvación' },
];

/** Tiempo de activación / duración (buckets) */
export const DURATION_OPTIONS = [
  { id: 'instantaneo', label: 'Instantáneo' },
  { id: '1turno', label: '1 turno' },
  { id: '1minuto', label: '1 minuto (10 turnos)' },
  { id: '10minutos', label: '10 minutos' },
  { id: '1hora', label: '1 hora' },
  { id: '8horas', label: '8 horas' },
  { id: '24horas', label: '24 horas / 1 día' },
  { id: 'largo', label: 'Más largo / especial' },
];

export const RANGE_OPTIONS = [
  { id: 'personal', label: 'Personal' },
  { id: 'toque', label: 'Toque' },
  { id: 'corto', label: 'Corto (≤ 30 pies)' },
  { id: 'medio', label: 'Medio (31–90 pies)' },
  { id: 'largo', label: 'Largo (≥ 120 pies)' },
  { id: 'especial', label: 'Especial / ilimitado' },
];

export const FLAG_OPTIONS = [
  { id: 'concentration', label: 'Concentración' },
  { id: 'ritual', label: 'Ritual' },
  { id: 'aoe', label: 'Área de efecto' },
];

/**
 * Estado vacío de filtros (sets de ids activos por grupo).
 */
export function createEmptyFilters() {
  return {
    levels: new Set(),
    classes: new Set(),
    schools: new Set(),
    flags: new Set(),
    cast: new Set(),
    saves: new Set(),
    durations: new Set(),
    ranges: new Set(),
  };
}

export function countActiveFilters(filters) {
  return Object.values(filters).reduce((n, set) => n + set.size, 0);
}

function normalizeCastBucket(castingTime) {
  const t = (castingTime || '').toLowerCase();
  if (!t) return null;
  if (t.includes('reacción') || t.includes('reaccion')) return 'reaccion';
  if (t.includes('adicional') || t.includes('bonus')) return 'bonus';
  if (t.includes('acción') || t.includes('accion')) {
    if (t.includes('8 hora')) return '1hora+';
    return 'accion';
  }
  if (t.includes('1 minuto')) return '1min';
  if (t.includes('10 minuto')) return '10min';
  if (
    t.includes('hora') ||
    t.includes('12 hora') ||
    t.includes('24 hora') ||
    t.includes('8 hora')
  ) {
    return '1hora+';
  }
  return null;
}

function normalizeDurationBucket(duration) {
  const d = (duration || '').toLowerCase();
  if (!d) return null;
  if (d.startsWith('instantáneo') || d.startsWith('instantaneo')) return 'instantaneo';

  // Turnos explícitos cortos
  if (/\b1 turno\b/.test(d) && !d.includes('minuto') && !d.includes('10 turno')) {
    return '1turno';
  }
  if (d.includes('6 turnos')) return '1turno';

  if (d.includes('10 minutos') || d.includes('(100 turnos)')) return '10minutos';
  if (d.includes('1 minuto') || d.includes('(10 turnos)')) return '1minuto';
  if (d.includes('8 horas') || d.includes('(4800 turnos)')) return '8horas';
  if (
    d.includes('24 horas') ||
    d.includes('1 día') ||
    d.includes('1 dia') ||
    d.includes('(14400 turnos)')
  ) {
    return '24horas';
  }
  if (d.includes('1 hora') || d.includes('(600 turnos)') || d.includes('2 horas')) {
    return '1hora';
  }
  if (
    d.includes('disipado') ||
    d.includes('días') ||
    d.includes('dias') ||
    d.includes('especial') ||
    d.includes('permanente')
  ) {
    return 'largo';
  }
  return 'largo';
}

function parseFeet(range) {
  const m = (range || '').match(/(\d+)\s*pies/i);
  return m ? Number(m[1]) : null;
}

function normalizeRangeBucket(range) {
  const r = (range || '').trim();
  if (!r) return null;
  const lower = r.toLowerCase();

  if (
    lower === 'personal' ||
    lower === 'lanzador' ||
    lower.startsWith('personal (')
  ) {
    return 'personal';
  }
  if (lower === 'toque') return 'toque';

  if (
    lower.includes('ilimitado') ||
    lower.includes('vista') ||
    lower.includes('milla') ||
    lower.includes('especial') ||
    lower.includes('dimensión')
  ) {
    return 'especial';
  }

  const feet = parseFeet(r);
  if (feet == null) return 'especial';
  if (feet <= 30) return 'corto';
  if (feet <= 90) return 'medio';
  return 'largo';
}

function spellSaveKeys(spell) {
  const type = spell?.savingThrow?.type;
  if (!type) return ['none'];
  const keys = [];
  const abilities = [
    'Fuerza',
    'Destreza',
    'Constitución',
    'Inteligencia',
    'Sabiduría',
    'Carisma',
  ];
  for (const ab of abilities) {
    if (type.includes(ab)) keys.push(ab);
  }
  return keys.length ? keys : ['none'];
}

function matchesGroup(selectedSet, predicateOrValues) {
  if (!selectedSet.size) return true;
  if (typeof predicateOrValues === 'function') {
    return predicateOrValues();
  }
  for (const v of predicateOrValues) {
    if (selectedSet.has(v)) return true;
  }
  return false;
}

/**
 * @param {object[]} spells
 * @param {ReturnType<typeof createEmptyFilters>} filters
 * @param {Record<string, Set<string>>|null} classSpellIds - classId -> Set(spellId)
 */
export function applySpellFilters(spells, filters, classSpellIds = null) {
  return spells.filter((spell) => {
    if (!matchesGroup(filters.levels, [String(spell.level ?? '')])) return false;

    if (filters.classes.size) {
      if (!classSpellIds) return false;
      let inClass = false;
      for (const classId of filters.classes) {
        const set = classSpellIds[classId];
        if (set && set.has(spell.id)) {
          inClass = true;
          break;
        }
      }
      if (!inClass) return false;
    }

    if (!matchesGroup(filters.schools, [spell.school])) return false;

    if (filters.flags.has('concentration') && !spell.concentration) return false;
    if (filters.flags.has('ritual') && !spell.ritual) return false;
    if (filters.flags.has('aoe') && !spell.areaOfEffect) return false;

    if (
      !matchesGroup(filters.cast, () => {
        const bucket = normalizeCastBucket(spell.castingTime);
        return bucket ? filters.cast.has(bucket) : false;
      })
    ) {
      return false;
    }

    if (!matchesGroup(filters.saves, spellSaveKeys(spell))) return false;

    if (
      !matchesGroup(filters.durations, () => {
        const bucket = normalizeDurationBucket(spell.duration);
        return bucket ? filters.durations.has(bucket) : false;
      })
    ) {
      return false;
    }

    if (
      !matchesGroup(filters.ranges, () => {
        const bucket = normalizeRangeBucket(spell.range);
        return bucket ? filters.ranges.has(bucket) : false;
      })
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Secciones del panel (orden de UI).
 */
export const FILTER_SECTIONS = [
  { key: 'levels', title: 'Nivel', options: LEVEL_OPTIONS },
  { key: 'classes', title: 'Clase', options: CLASS_OPTIONS },
  { key: 'schools', title: 'Escuela', options: SCHOOL_OPTIONS },
  { key: 'flags', title: 'Propiedades', options: FLAG_OPTIONS },
  { key: 'saves', title: 'Salvación', options: SAVE_OPTIONS },
  { key: 'cast', title: 'Lanzamiento', options: CAST_OPTIONS },
  { key: 'durations', title: 'Tiempo de activación', options: DURATION_OPTIONS },
  { key: 'ranges', title: 'Alcance', options: RANGE_OPTIONS },
];
