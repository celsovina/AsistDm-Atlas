/**
 * Render compartido del detalle de un conjuro.
 * @param {HTMLElement} pane
 * @param {object|null} spell
 */
export function renderSpellDetail(pane, spell) {
  if (!pane) return;

  if (!spell) {
    pane.innerHTML =
      '<div class="description-placeholder">Selecciona un hechizo para ver su información detallada.</div>';
    return;
  }

  const comps = Array.isArray(spell.components)
    ? spell.components.join(', ')
    : spell.components || '—';

  const metaRows = [
    ['Nivel', String(spell.level ?? '—')],
    ['Escuela', spell.school || '—'],
    ['Ritual', spell.ritual ? 'Sí' : 'No'],
    ['Concentración', spell.concentration ? 'Sí' : 'No'],
    ['Tiempo', spell.castingTime || '—'],
    ['Alcance', spell.range || '—'],
    ['Componentes', comps],
    ['Duración', spell.duration || '—'],
  ];

  if (spell.areaOfEffect) {
    metaRows.push(['Área', spell.areaOfEffect]);
  }

  if (spell.materials && spell.materials.length) {
    metaRows.push(['Materiales', spell.materials.join('; ')]);
  }

  if (spell.savingThrow?.type) {
    metaRows.push(['Salvación', spell.savingThrow.type]);
  }

  const upcastHtml = spell.upcast
    ? `<div class="spells-upcast"><strong>A niveles superiores</strong>${spell.upcast}</div>`
    : '';

  pane.innerHTML = `
    <div class="spells-detail-content">
      <h4>${spell.name || spell.id}</h4>
      <ul>
        ${metaRows.map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`).join('')}
      </ul>
      <div class="spells-description-content">
        <p>${spell.description || '—'}</p>
        ${upcastHtml}
      </div>
    </div>
  `;
}

export function spellLevelBadge(level) {
  return level === 0 ? 'Truco' : `N${level}`;
}
