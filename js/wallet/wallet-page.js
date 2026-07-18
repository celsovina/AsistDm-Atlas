/**
 * Página Billetera — monedero único + calculadora de cambio.
 * Pills clicables + modal Agregar/Retirar; feedback por toast.
 */

import { CustomSelect } from '../ui/custom-select.js';
import { showToast } from '../ui/toast.js';
import {
  CURRENCY_ORDER_DESC,
  convertPurse,
  createEmptyPurse,
  formatPurseParts,
  getBaseValue,
  normalizePurse,
} from './coin-converter.js';
import { loadPurse, savePurse } from './wallet-storage.js';

const ORDER = CURRENCY_ORDER_DESC;

const COINS_META = {
  ppt: { abbr: 'PPT', name: 'Platino' },
  po: { abbr: 'PO', name: 'Oro' },
  pe: { abbr: 'PE', name: 'Electrum' },
  pp: { abbr: 'PP', name: 'Plata' },
  pc: { abbr: 'PC', name: 'Cobre' },
};

const CURRENCY_OPTIONS = ORDER.map((id) => ({
  value: id,
  text: `${COINS_META[id].abbr} — ${COINS_META[id].name}`,
}));

const MODE_OPTIONS = [
  { value: 'complete', text: 'Bolsa completa' },
  { value: 'specific', text: 'Cantidad específica' },
];

const INSUFFICIENT_MSG =
  'No tienes suficientes monedas, prueba con otra denominación';

/**
 * @param {object} opts
 * @param {HTMLElement} opts.page
 */
export function createWalletPage({ page }) {
  if (!page) {
    console.error('[Atlas] No se encontró #wallet-page');
    return { show() {}, hide() {}, load() {} };
  }

  /** @type {{ ppt: number, po: number, pe: number, pp: number, pc: number }} */
  let purse = createEmptyPurse();

  let calculatorMode = 'specific';
  /** @type {string|null} */
  let editingCurrency = null;
  /** @type {CustomSelect|null} */
  let modeSelect = null;
  /** @type {CustomSelect|null} */
  let fullTargetSelect = null;
  /** @type {CustomSelect|null} */
  let specificFromSelect = null;
  /** @type {CustomSelect|null} */
  let specificToSelect = null;
  let mounted = false;
  let tooltipOpen = false;

  /** @type {(e: KeyboardEvent) => void} */
  let onModalKeydown = null;
  /** @type {(e: MouseEvent) => void} */
  let onTooltipDocClick = null;

  function cloneCoins(coins) {
    return normalizePurse(coins);
  }

  function formatPurseLabel(nextPurse) {
    const parts = formatPurseParts(nextPurse);
    return parts.length > 0 ? parts.join(', ') : '0';
  }

  function persistPurse(next, toastMessage) {
    purse = cloneCoins(next);
    savePurse(purse);
    refreshPills();
    refreshCalculatorPreview();
    if (toastMessage) {
      showToast({ type: 'success', message: toastMessage });
    }
  }

  function refreshPills() {
    ORDER.forEach((key) => {
      const el = page.querySelector(`#wallet-value-${key}`);
      if (el) el.textContent = String(purse[key] || 0);
    });
  }

  function getModalEls() {
    return {
      overlay: page.querySelector('#wallet-coin-modal'),
      panel: page.querySelector('#wallet-modal-panel'),
      abbr: page.querySelector('#wallet-modal-abbr'),
      input: page.querySelector('#wallet-modal-amount'),
      balanceLine: page.querySelector('#wallet-modal-balance-line'),
      opAdd: page.querySelector('#wallet-modal-op-add'),
      opSub: page.querySelector('#wallet-modal-op-sub'),
    };
  }

  function parseModalAmount() {
    const { input } = getModalEls();
    const raw = String(input?.value || '').trim();
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return 0;
    return n;
  }

  function refreshModalVisor() {
    const { panel, abbr, balanceLine, opAdd, opSub } = getModalEls();
    if (!editingCurrency || !balanceLine || !opAdd || !opSub) return;

    const meta = COINS_META[editingCurrency];
    const current = Number(purse[editingCurrency]) || 0;
    const amount = parseModalAmount();

    if (panel) {
      panel.className = `wallet-modal__panel wallet-modal__panel--${editingCurrency}`;
    }
    if (abbr) abbr.textContent = meta.abbr;

    balanceLine.textContent = `Tienes: ${current} ${meta.abbr}`;
    balanceLine.className = `wallet-modal__balance-line wallet-modal__balance-line--${editingCurrency}`;

    if (amount <= 0) {
      opAdd.textContent = `${current} + … = …`;
      opSub.textContent = `${current} − … = …`;
      return;
    }

    const addResult = current + amount;
    const canSubtract = amount <= current;
    const subResult = current - amount;

    opAdd.textContent = `${current} + ${amount} = ${addResult}`;
    opSub.textContent = canSubtract
      ? `${current} − ${amount} = ${subResult}`
      : '¡No te alcanza!';
  }

  function openCoinModal(currency) {
    closeEquivTooltip();
    editingCurrency = currency;
    const { overlay, input } = getModalEls();
    if (!overlay) return;

    if (input) input.value = '';
    refreshModalVisor();
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');

    onModalKeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCoinModal();
      }
    };
    document.addEventListener('keydown', onModalKeydown);

    window.setTimeout(() => {
      input?.focus();
      input?.select?.();
    }, 30);
  }

  function closeCoinModal() {
    const { overlay, panel } = getModalEls();
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (panel) panel.className = 'wallet-modal__panel';
    editingCurrency = null;
    if (onModalKeydown) {
      document.removeEventListener('keydown', onModalKeydown);
      onModalKeydown = null;
    }
  }

  function applyModalAdd() {
    if (!editingCurrency) return;
    const amount = parseModalAmount();
    if (amount <= 0) {
      showToast({ type: 'warning', message: 'Ingresa una cantidad válida.' });
      return;
    }
    const next = cloneCoins(purse);
    next[editingCurrency] = (next[editingCurrency] || 0) + amount;
    const abbr = COINS_META[editingCurrency].abbr;
    persistPurse(next, `+${amount} ${abbr}`);
    closeCoinModal();
  }

  function applyModalSubtract() {
    if (!editingCurrency) return;
    const amount = parseModalAmount();
    if (amount <= 0) {
      showToast({ type: 'warning', message: 'Ingresa una cantidad válida.' });
      return;
    }
    const current = Number(purse[editingCurrency]) || 0;
    if (amount > current) {
      showToast({ type: 'warning', message: INSUFFICIENT_MSG });
      return;
    }
    const next = cloneCoins(purse);
    next[editingCurrency] = current - amount;
    const abbr = COINS_META[editingCurrency].abbr;
    persistPurse(next, `−${amount} ${abbr}`);
    closeCoinModal();
  }

  function closeEquivTooltip() {
    const tip = page.querySelector('#wallet-equiv-tooltip');
    const btn = page.querySelector('#wallet-equiv-help');
    if (tip) tip.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
    tooltipOpen = false;
    if (onTooltipDocClick) {
      document.removeEventListener('click', onTooltipDocClick, true);
      onTooltipDocClick = null;
    }
  }

  function openEquivTooltip() {
    const tip = page.querySelector('#wallet-equiv-tooltip');
    const btn = page.querySelector('#wallet-equiv-help');
    if (!tip || !btn) return;
    tip.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    tooltipOpen = true;

    onTooltipDocClick = (e) => {
      // Cierra al tocar fuera o dentro del tooltip (toggle / leí y cierro)
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (btn.contains(target) && tip.hidden === false) {
        // el click del botón ya se gestiona en toggle; ignorar el bubbling del open
        return;
      }
      closeEquivTooltip();
    };
    // next tick para no cerrar con el mismo click que abrió
    window.setTimeout(() => {
      document.addEventListener('click', onTooltipDocClick, true);
    }, 0);
  }

  function toggleEquivTooltip() {
    if (tooltipOpen) closeEquivTooltip();
    else openEquivTooltip();
  }

  function buildFullConversionResult(targetCurrency) {
    const conversion = convertPurse(purse, targetCurrency);
    const result = createEmptyPurse();
    result[targetCurrency] = conversion.totalWholeInTarget;
    ORDER.forEach((currency) => {
      result[currency] += Number(conversion.remainder?.[currency]) || 0;
    });
    return { conversion, result };
  }

  function computeSpecificConversion() {
    const amountInput = page.querySelector('#wallet-calc-amount');
    const amount = Math.max(0, parseInt(amountInput?.value, 10) || 0);
    const from = specificFromSelect?.getValue() || '';
    const to = specificToSelect?.getValue() || '';

    if (!from || !to) {
      return { isValid: false, message: 'Selecciona origen y destino.' };
    }
    if (from === to) {
      return {
        isValid: false,
        message: 'Origen y destino no pueden ser la misma moneda.',
      };
    }
    if (amount <= 0) {
      return { isValid: false, message: 'Ingresa una cantidad válida.' };
    }

    const available = Number(purse[from]) || 0;
    if (available < amount) {
      return {
        isValid: false,
        message: INSUFFICIENT_MSG,
      };
    }

    const fromValue = getBaseValue(from);
    const toValue = getBaseValue(to);
    const totalBase = amount * fromValue;
    const wholeTarget = Math.floor(totalBase / toValue);

    if (wholeTarget <= 0) {
      return {
        isValid: false,
        message: `No alcanza para 1 ${to.toUpperCase()}.`,
      };
    }

    const remainderBase = totalBase - wholeTarget * toValue;
    const remainderOrigin = Math.floor(remainderBase / fromValue);
    const usedOrigin = amount - remainderOrigin;
    const nextCoins = cloneCoins(purse);
    nextCoins[from] = Math.max(0, nextCoins[from] - usedOrigin);
    nextCoins[to] = (nextCoins[to] || 0) + wholeTarget;

    return {
      isValid: true,
      amount,
      from,
      to,
      wholeTarget,
      remainderOrigin,
      usedOrigin,
      nextCoins,
    };
  }

  function refreshCalculatorPreview() {
    const previewEl = page.querySelector('#wallet-calc-preview');
    if (!previewEl) return;

    if (calculatorMode === 'specific') {
      const preview = computeSpecificConversion();
      if (!preview.isValid) {
        previewEl.textContent = '';
        previewEl.dataset.empty = '1';
        return;
      }
      previewEl.dataset.empty = '0';
      previewEl.textContent = `Se convertirán ${preview.usedOrigin} ${String(preview.from).toUpperCase()} en ${preview.wholeTarget} ${String(preview.to).toUpperCase()}${
        preview.remainderOrigin > 0
          ? `. Restante: ${preview.remainderOrigin} ${String(preview.from).toUpperCase()}.`
          : '.'
      }`;
      return;
    }

    const target = fullTargetSelect?.getValue() || '';
    if (!target) {
      previewEl.textContent = '';
      previewEl.dataset.empty = '1';
      return;
    }
    const result = buildFullConversionResult(target);
    previewEl.dataset.empty = '0';
    previewEl.textContent = `Resultado: ${formatPurseLabel(result.result)}.`;
  }

  function renderCalculatorPanel() {
    const panel = page.querySelector('#wallet-calc-panel');
    if (!panel) return;

    if (fullTargetSelect) {
      fullTargetSelect.destroy();
      fullTargetSelect = null;
    }
    if (specificFromSelect) {
      specificFromSelect.destroy();
      specificFromSelect = null;
    }
    if (specificToSelect) {
      specificToSelect.destroy();
      specificToSelect = null;
    }

    if (calculatorMode === 'specific') {
      panel.innerHTML = `
        <div class="wallet-calc__row wallet-calc__row--stack">
          <input class="wallet-input" id="wallet-calc-amount" type="number" inputmode="numeric" min="1" step="1" placeholder="Cantidad" />
          <div id="wallet-calc-from-mount"></div>
          <div id="wallet-calc-to-mount"></div>
        </div>
        <div class="wallet-calc__preview" id="wallet-calc-preview" data-empty="1"></div>
        <div class="wallet-calc__actions">
          <button type="button" class="wallet-btn" id="wallet-calc-apply-specific">Convertir</button>
        </div>
      `;

      page.querySelector('#wallet-calc-amount')?.addEventListener('input', () => {
        refreshCalculatorPreview();
      });

      specificFromSelect = new CustomSelect({
        id: 'wallet-calc-from',
        name: 'walletFrom',
        options: CURRENCY_OPTIONS,
        value: 'pp',
        className: 'wallet-select',
        onChange: () => refreshCalculatorPreview(),
      });
      specificToSelect = new CustomSelect({
        id: 'wallet-calc-to',
        name: 'walletTo',
        options: CURRENCY_OPTIONS,
        value: 'po',
        className: 'wallet-select',
        onChange: () => refreshCalculatorPreview(),
      });

      page
        .querySelector('#wallet-calc-from-mount')
        ?.appendChild(specificFromSelect.getElement());
      page
        .querySelector('#wallet-calc-to-mount')
        ?.appendChild(specificToSelect.getElement());

      page
        .querySelector('#wallet-calc-apply-specific')
        ?.addEventListener('click', () => {
          const preview = computeSpecificConversion();
          if (!preview.isValid) {
            showToast({ type: 'warning', message: preview.message });
            return;
          }
          persistPurse(
            preview.nextCoins,
            `Conversión: ${preview.wholeTarget} ${String(preview.to).toUpperCase()}`
          );
        });
    } else {
      panel.innerHTML = `
        <div class="wallet-calc__row">
          <div id="wallet-calc-target-mount"></div>
        </div>
        <div class="wallet-calc__preview" id="wallet-calc-preview" data-empty="1"></div>
        <div class="wallet-calc__actions">
          <button type="button" class="wallet-btn" id="wallet-calc-apply-full">Convertir</button>
        </div>
      `;

      fullTargetSelect = new CustomSelect({
        id: 'wallet-calc-target',
        name: 'walletTarget',
        options: CURRENCY_OPTIONS,
        value: 'po',
        className: 'wallet-select',
        onChange: () => refreshCalculatorPreview(),
      });
      page
        .querySelector('#wallet-calc-target-mount')
        ?.appendChild(fullTargetSelect.getElement());

      page
        .querySelector('#wallet-calc-apply-full')
        ?.addEventListener('click', () => {
          const target = fullTargetSelect?.getValue() || '';
          if (!target) {
            showToast({
              type: 'warning',
              message: 'Selecciona una moneda objetivo.',
            });
            return;
          }
          const result = buildFullConversionResult(target);
          persistPurse(result.result, 'Conversión completa aplicada.');
        });
    }

    refreshCalculatorPreview();
  }

  function renderModeSelect() {
    const mount = page.querySelector('#wallet-calc-mode-mount');
    if (!mount) return;
    if (modeSelect) {
      modeSelect.destroy();
      modeSelect = null;
    }
    mount.innerHTML = '';
    modeSelect = new CustomSelect({
      id: 'wallet-calc-mode',
      name: 'walletMode',
      options: MODE_OPTIONS,
      value: calculatorMode,
      className: 'wallet-select',
      onChange: (value) => {
        calculatorMode = value || 'specific';
        renderCalculatorPanel();
      },
    });
    mount.appendChild(modeSelect.getElement());
  }

  function bindModal() {
    const overlay = page.querySelector('#wallet-coin-modal');
    if (!overlay) return;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeCoinModal();
    });

    page
      .querySelector('#wallet-modal-close')
      ?.addEventListener('click', () => closeCoinModal());
    page
      .querySelector('#wallet-modal-add')
      ?.addEventListener('click', () => applyModalAdd());
    page
      .querySelector('#wallet-modal-sub')
      ?.addEventListener('click', () => applyModalSubtract());

    const input = page.querySelector('#wallet-modal-amount');
    input?.addEventListener('input', () => refreshModalVisor());
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyModalAdd();
      }
    });
  }

  function bindPills() {
    page.querySelectorAll('[data-coin-pill]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-coin-pill');
        if (key && COINS_META[key]) openCoinModal(key);
      });
    });
  }

  function bindTooltip() {
    page
      .querySelector('#wallet-equiv-help')
      ?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleEquivTooltip();
      });

    page
      .querySelector('#wallet-equiv-tooltip')
      ?.addEventListener('click', () => {
        closeEquivTooltip();
      });
  }

  function mountShell() {
    const pills = ORDER.map((key) => {
      const meta = COINS_META[key];
      return `
        <button
          type="button"
          class="wallet-pill wallet-pill--${key}"
          data-coin-pill="${key}"
          aria-label="Ajustar ${meta.name}"
        >
          <span class="wallet-pill__abbr">${meta.abbr}</span>
          <span class="wallet-pill__value" id="wallet-value-${key}">0</span>
        </button>`;
    }).join('');

    page.innerHTML = `
      <div class="wallet-page">
        <header class="wallet-page__header">
          <h2 class="wallet-page__title">Billetera</h2>
          <p class="wallet-page__lead">
            Toca una moneda para agregar o retirar. Usa la calculadora para cambiar denominaciones.
          </p>
        </header>

        <section class="wallet-box" aria-label="Monedero">
          <h3 class="wallet-box__title">Monedero</h3>
          <div class="wallet-grid">${pills}</div>
        </section>

        <section class="wallet-box wallet-box--calc" aria-label="Calculadora de cambio">
          <div class="wallet-box__title-row">
            <h3 class="wallet-box__title wallet-box__title--inline">Calculadora de cambio</h3>
            <div class="wallet-help">
              <button
                type="button"
                class="wallet-help__btn"
                id="wallet-equiv-help"
                aria-label="Ver equivalencias"
                aria-expanded="false"
                aria-controls="wallet-equiv-tooltip"
              >?</button>
              <div
                class="wallet-help__tooltip"
                id="wallet-equiv-tooltip"
                role="tooltip"
                hidden
              >
                <div>1 PPT = 10 PO</div>
                <div>1 PO = 2 PE</div>
                <div>1 PE = 5 PP</div>
                <div>1 PP = 10 PC</div>
              </div>
            </div>
          </div>
          <div id="wallet-calc-mode-mount"></div>
          <div id="wallet-calc-panel" class="wallet-calc"></div>
        </section>
      </div>

      <div
        class="wallet-modal"
        id="wallet-coin-modal"
        hidden
        aria-hidden="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-modal-balance-line"
      >
        <div class="wallet-modal__panel" id="wallet-modal-panel">
          <div class="wallet-modal__header">
            <h3
              class="wallet-modal__balance-line"
              id="wallet-modal-balance-line"
            >Tienes: 0</h3>
            <button type="button" class="wallet-modal__close" id="wallet-modal-close" aria-label="Cerrar">×</button>
          </div>

          <div class="wallet-modal__amount">
            <span class="wallet-modal__amount-abbr" id="wallet-modal-abbr">PO</span>
            <input
              class="wallet-modal__amount-input"
              id="wallet-modal-amount"
              type="number"
              inputmode="numeric"
              min="1"
              step="1"
              placeholder="0"
              autocomplete="off"
              aria-label="Cantidad"
            />
          </div>

          <div class="wallet-modal__ops" aria-live="polite">
            <div class="wallet-modal__op wallet-modal__op--add" id="wallet-modal-op-add">0 + … = …</div>
            <div class="wallet-modal__op wallet-modal__op--sub" id="wallet-modal-op-sub">0 − … = …</div>
          </div>

          <div class="wallet-modal__actions">
            <button type="button" class="wallet-btn wallet-btn--sub" id="wallet-modal-sub">Retirar</button>
            <button type="button" class="wallet-btn wallet-btn--primary wallet-btn--add" id="wallet-modal-add">Agregar</button>
          </div>
        </div>
      </div>
    `;

    bindPills();
    bindModal();
    bindTooltip();
    renderModeSelect();
    renderCalculatorPanel();
    mounted = true;
  }

  function loadFromStorage() {
    purse = loadPurse();
    if (!mounted) mountShell();
    else {
      closeCoinModal();
      closeEquivTooltip();
      renderModeSelect();
      renderCalculatorPanel();
    }
    refreshPills();
    refreshCalculatorPreview();
  }

  return {
    load() {
      loadFromStorage();
    },
    show() {
      page.hidden = false;
      page.removeAttribute('hidden');
    },
    hide() {
      closeCoinModal();
      closeEquivTooltip();
      page.hidden = true;
    },
  };
}
