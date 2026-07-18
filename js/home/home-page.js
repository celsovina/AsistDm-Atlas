/**
 * Pantalla de inicio de Atlas: intro + accesos a módulos.
 */

/**
 * @param {object} opts
 * @param {HTMLElement} opts.page
 * @param {(sectionId: string) => void} opts.onNavigate
 */
export function createHomePage({ page, onNavigate }) {
  if (!page) {
    console.error('[Atlas] No se encontró #home-page');
    return {
      show() {},
      hide() {},
    };
  }

  function bindModules() {
    page.querySelectorAll('.atlas-home__module').forEach((btn) => {
      btn.addEventListener('click', () => {
        const section = btn.dataset.section;
        if (section && typeof onNavigate === 'function') {
          onNavigate(section);
        }
      });
    });
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  bindModules();
  refreshIcons();

  return {
    show() {
      page.hidden = false;
      page.removeAttribute('hidden');
      refreshIcons();
    },
    hide() {
      page.hidden = true;
    },
  };
}
