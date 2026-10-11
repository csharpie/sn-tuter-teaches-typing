// Locale-aware number formatting with the locale the server resolved (A5.5).
// Formatters are cached per locale and option set.

const cache = new Map();

function formatter(locale, options) {
  const key = `${locale}|${JSON.stringify(options)}`;
  if (!cache.has(key)) {
    let created;
    try {
      created = new Intl.NumberFormat(locale || 'en', options);
    } catch {
      created = new Intl.NumberFormat('en', options);
    }
    cache.set(key, created);
  }
  return cache.get(key);
}

/** Whole number, e.g. a WPM, AWPM or error count. */
export function formatInteger(value, locale) {
  const n = Number(value);
  return formatter(locale, { maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? Math.round(n) : 0,
  );
}

/** Accuracy stored as 0-100. */
export function formatPercent(value, locale) {
  const n = Number(value);
  return formatter(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? n / 100 : 0,
  );
}

/** Milliseconds as m:ss (e.g. 1:05), for the session clock. */
export function formatClock(ms, locale) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${formatInteger(minutes, locale)}:${formatter(locale, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  }).format(seconds)}`;
}

/** Signed difference rounded to a whole number, e.g. +3 or -2. */
export function roundedDelta(current, previous) {
  const a = Number(current);
  const b = Number(previous);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round(a) - Math.round(b);
}
