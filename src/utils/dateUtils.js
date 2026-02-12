/**
 * Date utilities for resolving time periods to date ranges
 */

/**
 * Get the start of a day (00:00:00.000)
 * @param {Date} date
 * @returns {Date}
 */
export function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get the end of a day (23:59:59.999)
 * @param {Date} date
 * @returns {Date}
 */
export function endOfDay(date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Get the start of the week (Monday)
 * @param {Date} date
 * @returns {Date}
 */
export function startOfWeek(date) {
  const result = new Date(date);
  const day = result.getDay();
  // Adjust to Monday (day 1). If Sunday (0), go back 6 days
  const diff = day === 0 ? 6 : day - 1;
  result.setDate(result.getDate() - diff);
  return startOfDay(result);
}

/**
 * Get the end of the week (Sunday)
 * @param {Date} date
 * @returns {Date}
 */
export function endOfWeek(date) {
  const result = new Date(date);
  const day = result.getDay();
  // Adjust to Sunday (day 0)
  const diff = day === 0 ? 0 : 7 - day;
  result.setDate(result.getDate() + diff);
  return endOfDay(result);
}

/**
 * Get the start of the month
 * @param {Date} date
 * @returns {Date}
 */
export function startOfMonth(date) {
  const result = new Date(date);
  result.setDate(1);
  return startOfDay(result);
}

/**
 * Get the end of the month
 * @param {Date} date
 * @returns {Date}
 */
export function endOfMonth(date) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1);
  result.setDate(0); // Last day of previous month
  return endOfDay(result);
}

/**
 * Get a unique week key for grouping (YYYY-WW)
 * @param {Date} date
 * @returns {string}
 */
export function getWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  // January 4 is always in week 1
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNumber = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return `${d.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}

/**
 * Get a unique month key for grouping (YYYY-MM)
 * @param {Date} date
 * @returns {string}
 */
export function getMonthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

/**
 * Get a unique day key for grouping (YYYY-MM-DD)
 * @param {Date} date
 * @returns {string}
 */
export function getDayKey(date) {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

/**
 * Period resolvers - return { startDate, endDate } for each period
 */
const PERIOD_RESOLVERS = {
  today: () => {
    const now = new Date();
    return {
      startDate: startOfDay(now),
      endDate: endOfDay(now)
    };
  },

  yesterday: () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      startDate: startOfDay(yesterday),
      endDate: endOfDay(yesterday)
    };
  },

  this_week: () => {
    const now = new Date();
    return {
      startDate: startOfWeek(now),
      endDate: endOfDay(now)
    };
  },

  last_week: () => {
    const now = new Date();
    const lastWeek = new Date(now);
    lastWeek.setDate(lastWeek.getDate() - 7);
    return {
      startDate: startOfWeek(lastWeek),
      endDate: endOfWeek(lastWeek)
    };
  },

  this_month: () => {
    const now = new Date();
    return {
      startDate: startOfMonth(now),
      endDate: endOfDay(now)
    };
  },

  last_month: () => {
    const now = new Date();
    const lastMonth = new Date(now);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    return {
      startDate: startOfMonth(lastMonth),
      endDate: endOfMonth(lastMonth)
    };
  },

  last_7_days: () => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 6); // Include today = 7 days
    return {
      startDate: startOfDay(start),
      endDate: endOfDay(now)
    };
  },

  last_30_days: () => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 29); // Include today = 30 days
    return {
      startDate: startOfDay(start),
      endDate: endOfDay(now)
    };
  }
};

/**
 * Get list of supported periods
 * @returns {string[]}
 */
export function getSupportedPeriods() {
  return Object.keys(PERIOD_RESOLVERS);
}

/**
 * Resolve a period name or date range to start/end dates
 * @param {string|null} period - Period name (today, yesterday, this_week, etc.)
 * @param {string|null} startDate - Start date in YYYY-MM-DD format
 * @param {string|null} endDate - End date in YYYY-MM-DD format
 * @returns {{ startDate: Date|null, endDate: Date|null }}
 */
export function resolveDateRange(period, startDate, endDate) {
  // If period is provided, use the resolver
  if (period && PERIOD_RESOLVERS[period]) {
    return PERIOD_RESOLVERS[period]();
  }

  // If explicit dates are provided
  const result = { startDate: null, endDate: null };

  if (startDate) {
    const parsed = new Date(startDate);
    if (!isNaN(parsed.getTime())) {
      result.startDate = startOfDay(parsed);
    }
  }

  if (endDate) {
    const parsed = new Date(endDate);
    if (!isNaN(parsed.getTime())) {
      result.endDate = endOfDay(parsed);
    }
  }

  return result;
}

/**
 * Format a date range for display
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {string} locale - Locale for formatting (en, es, pt)
 * @returns {string}
 */
export function formatDateRange(startDate, endDate, locale = 'en') {
  const localeMap = {
    en: 'en-US',
    es: 'es-CO',
    pt: 'pt-BR'
  };
  const formatLocale = localeMap[locale] || 'en-US';

  const options = { month: 'short', day: 'numeric' };
  const startStr = startDate.toLocaleDateString(formatLocale, options);
  const endStr = endDate.toLocaleDateString(formatLocale, options);

  // If same day
  if (startStr === endStr) {
    return startStr;
  }

  return `${startStr} - ${endStr}`;
}

/**
 * Get period label for display
 * @param {string} period
 * @param {string} lang
 * @returns {string}
 */
export function getPeriodLabel(period, lang = 'en') {
  const labels = {
    en: {
      today: 'Today',
      yesterday: 'Yesterday',
      this_week: 'This week',
      last_week: 'Last week',
      this_month: 'This month',
      last_month: 'Last month',
      last_7_days: 'Last 7 days',
      last_30_days: 'Last 30 days'
    },
    es: {
      today: 'Hoy',
      yesterday: 'Ayer',
      this_week: 'Esta semana',
      last_week: 'Semana pasada',
      this_month: 'Este mes',
      last_month: 'Mes pasado',
      last_7_days: 'Últimos 7 días',
      last_30_days: 'Últimos 30 días'
    },
    pt: {
      today: 'Hoje',
      yesterday: 'Ontem',
      this_week: 'Esta semana',
      last_week: 'Semana passada',
      this_month: 'Este mês',
      last_month: 'Mês passado',
      last_7_days: 'Últimos 7 dias',
      last_30_days: 'Últimos 30 dias'
    }
  };

  const langLabels = labels[lang] || labels.en;
  return langLabels[period] || period;
}
