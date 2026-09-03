/**
 * Render Markdown ligero para las descripciones de conjuros.
 * Subconjunto soportado: párrafos, saltos de línea (dos espacios al final),
 * `---` (regla), listas `-` y `1.`, encabezados de sección (`**Texto**` en su
 * propia línea), tablas GFM y énfasis `*`, `**`, `***`.
 *
 * Las descripciones del Manual del Jugador son texto plano (sin marcado) y
 * pasan tal cual, envueltas en <p>.
 */

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Énfasis en línea. Se aplica después de escapar. */
function renderInline(text) {
  return escapeHtml(text)
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '$1<em>$2</em>');
}

function splitCells(row) {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function isSeparatorRow(row) {
  const cells = splitCells(row);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '');
}

function renderTable(rows) {
  let headCells = null;
  let bodyRows = rows;

  if (rows.length >= 2 && isSeparatorRow(rows[1])) {
    headCells = splitCells(rows[0]);
    bodyRows = rows.slice(2);
    if (headCells.every((c) => c === '')) headCells = null;
  }

  const thead = headCells
    ? `<thead><tr>${headCells
        .map((c) => `<th>${renderInline(c)}</th>`)
        .join('')}</tr></thead>`
    : '';

  const tbody = `<tbody>${bodyRows
    .map(
      (r) =>
        `<tr>${splitCells(r)
          .map((c) => `<td>${renderInline(c)}</td>`)
          .join('')}</tr>`
    )
    .join('')}</tbody>`;

  return `<div class="spells-md-tablewrap"><table class="spells-md-table">${thead}${tbody}</table></div>`;
}

const LIST_RE = /^\s*(?:[-*]|\d+[.)])\s+/;

/**
 * @param {string|null|undefined} md
 * @returns {string} HTML
 */
export function renderSpellMarkdown(md) {
  if (!md) return '<p>—</p>';

  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];

    if (raw.trim() === '') {
      i += 1;
      continue;
    }

    if (/^\s*-{3,}\s*$/.test(raw)) {
      out.push('<hr class="spells-md-hr">');
      i += 1;
      continue;
    }

    // Tabla: líneas consecutivas que empiezan por "|"
    if (raw.trim().startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i]);
        i += 1;
      }
      out.push(renderTable(rows));
      continue;
    }

    // Lista
    if (LIST_RE.test(raw)) {
      const ordered = /^\s*\d+[.)]\s/.test(raw);
      const items = [];
      while (i < lines.length && LIST_RE.test(lines[i])) {
        items.push(lines[i].replace(LIST_RE, ''));
        i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(
        `<${tag} class="spells-md-list">${items
          .map((t) => `<li>${renderInline(t)}</li>`)
          .join('')}</${tag}>`
      );
      continue;
    }

    // Párrafo
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('|') &&
      !/^\s*-{3,}\s*$/.test(lines[i]) &&
      !LIST_RE.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }

    // Encabezado de sección: un único renglón "**Texto**"
    if (para.length === 1 && /^\*\*[^*].*[^*]\*\*$|^\*\*[^*]\*\*$/.test(para[0].trim())) {
      out.push(
        `<p class="spells-md-h">${renderInline(para[0].trim())}</p>`
      );
      continue;
    }

    const html = para
      .map((line, idx) => {
        const hardBreak = /\s{2,}$/.test(line) && idx < para.length - 1;
        return renderInline(line.trim()) + (hardBreak ? '<br>' : '');
      })
      .join(' ');
    out.push(`<p>${html}</p>`);
  }

  return out.join('\n');
}
