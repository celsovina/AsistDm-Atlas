/**
 * CoinConverter — equivalencias y conversión de monedas (Atlas).
 * Port ES module de js/utils/coin-converter.js (AsistDM).
 *
 * Reglas:
 * - 10 PC = 1 PP
 * - 5 PP = 1 PE
 * - 2 PE = 1 PO
 * - 10 PO = 1 PPT
 */

export const CURRENCY_ORDER_ASC = ['pc', 'pp', 'pe', 'po', 'ppt'];
export const CURRENCY_ORDER_DESC = ['ppt', 'po', 'pe', 'pp', 'pc'];

export const BASE_VALUES = {
  pc: 1,
  pp: 10,
  pe: 50,
  po: 100,
  ppt: 1000,
};

export function normalizeCurrency(currency) {
  return String(currency || '')
    .trim()
    .toLowerCase();
}

export function isValidCurrency(currency) {
  return Object.prototype.hasOwnProperty.call(
    BASE_VALUES,
    normalizeCurrency(currency)
  );
}

export function sanitizeAmount(amount) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

export function createEmptyPurse() {
  return { ppt: 0, po: 0, pe: 0, pp: 0, pc: 0 };
}

export function normalizePurse(purse) {
  const normalized = createEmptyPurse();
  if (!purse || typeof purse !== 'object') return normalized;

  CURRENCY_ORDER_DESC.forEach((currency) => {
    normalized[currency] = sanitizeAmount(purse[currency]);
  });

  return normalized;
}

export function getBaseValue(currency) {
  const normalizedCurrency = normalizeCurrency(currency);
  if (!isValidCurrency(normalizedCurrency)) {
    throw new Error(`Moneda no válida: ${currency}`);
  }
  return BASE_VALUES[normalizedCurrency];
}

export function toBaseUnits(amount, currency) {
  return sanitizeAmount(amount) * getBaseValue(currency);
}

export function getExchangeRate(fromCurrency, toCurrency) {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);

  if (!isValidCurrency(from) || !isValidCurrency(to)) {
    throw new Error(`Conversión no válida: ${fromCurrency} -> ${toCurrency}`);
  }

  const fromValue = getBaseValue(from);
  const toValue = getBaseValue(to);

  if (fromValue === toValue) {
    return { from, to, multiplier: 1, divisor: 1, isSameCurrency: true };
  }

  if (fromValue < toValue) {
    return {
      from,
      to,
      multiplier: 1,
      divisor: toValue / fromValue,
      isSameCurrency: false,
    };
  }

  return {
    from,
    to,
    multiplier: fromValue / toValue,
    divisor: 1,
    isSameCurrency: false,
  };
}

function decomposeRemainder(baseRemainder, targetCurrency) {
  const target = normalizeCurrency(targetCurrency);
  const targetIndex = CURRENCY_ORDER_ASC.indexOf(target);
  if (targetIndex === -1) {
    throw new Error(`Moneda objetivo no válida: ${targetCurrency}`);
  }

  let remaining = sanitizeAmount(baseRemainder);
  const remainder = createEmptyPurse();

  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const currency = CURRENCY_ORDER_ASC[index];
    const currencyValue = BASE_VALUES[currency];
    const whole = Math.floor(remaining / currencyValue);
    remainder[currency] = whole;
    remaining -= whole * currencyValue;
  }

  return remainder;
}

export function convertAmount(amount, fromCurrency, toCurrency) {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);

  if (!isValidCurrency(from) || !isValidCurrency(to)) {
    throw new Error(`Conversión no válida: ${fromCurrency} -> ${toCurrency}`);
  }

  const totalBase = toBaseUnits(amount, from);
  const targetValue = getBaseValue(to);
  const whole = Math.floor(totalBase / targetValue);
  const remainderBase = totalBase - whole * targetValue;

  return {
    fromCurrency: from,
    toCurrency: to,
    originalAmount: sanitizeAmount(amount),
    totalInBaseUnits: totalBase,
    wholeAmount: whole,
    remainder: decomposeRemainder(remainderBase, to),
    isExact: remainderBase === 0,
  };
}

export function getPurseBaseValue(purse) {
  const normalized = normalizePurse(purse);
  return CURRENCY_ORDER_DESC.reduce((sum, currency) => {
    return sum + normalized[currency] * BASE_VALUES[currency];
  }, 0);
}

export function convertPurse(purse, targetCurrency) {
  const target = normalizeCurrency(targetCurrency);
  if (!isValidCurrency(target)) {
    throw new Error(`Moneda objetivo no válida: ${targetCurrency}`);
  }

  const normalized = normalizePurse(purse);
  const totalBase = getPurseBaseValue(normalized);
  const targetValue = getBaseValue(target);
  const whole = Math.floor(totalBase / targetValue);
  const remainderBase = totalBase - whole * targetValue;
  const remainder = decomposeRemainder(remainderBase, target);

  return {
    targetCurrency: target,
    normalizedPurse: normalized,
    totalInBaseUnits: totalBase,
    totalWholeInTarget: whole,
    remainder,
    isExact: remainderBase === 0,
  };
}

export function formatPurseParts(purse) {
  const normalized = normalizePurse(purse);
  return CURRENCY_ORDER_DESC.filter((currency) => normalized[currency] > 0).map(
    (currency) => `${normalized[currency]} ${currency.toUpperCase()}`
  );
}
