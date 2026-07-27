/**
 * OneCFilterExtractor — extracts structured filters from raw user text.
 *
 * Separates temporal, spatial, and attribute filters from the user query.
 * Works independently of entity extraction — entity and filters are orthogonal.
 *
 * Supported temporal patterns:
 *   сегодня / вчера / позавчера
 *   за неделю / за месяц / за квартал / за год
 *   за июль / за январь / ... (month name)
 *   за прошлый месяц / за прошлый квартал / за прошлый год
 *   с DD.MM.YYYY по DD.MM.YYYY / с DD.MM.YYYY
 *   DD.MM.YYYY / YYYY-MM-DD
 *
 * Supported attribute patterns:
 *   по <field> (groupBy hint)
 *
 * Usage:
 *   const extractor = new OneCFilterExtractor();
 *   const filters = extractor.extract("покажи реализации за июль");
 *   // { period: { type: 'month', month: 7, year: 2026 } }
 */

const MONTH_NAMES = {
  'январ': 1, 'январь': 1, 'января': 1,
  'феврал': 2, 'февраль': 2, 'февраля': 2,
  'март': 3, 'марта': 3,
  'апрел': 4, 'апрель': 4, 'апреля': 4,
  'мая': 5, 'май': 5,
  'июн': 6, 'июнь': 6, 'июня': 6,
  'июл': 7, 'июль': 7, 'июля': 7,
  'август': 8, 'августа': 8,
  'сентябр': 9, 'сентябрь': 9, 'сентября': 9,
  'октябр': 10, 'октябрь': 10, 'октября': 10,
  'ноябр': 11, 'ноябрь': 11, 'ноября': 11,
  'декабр': 12, 'декабрь': 12, 'декабря': 12,
};

const DATE_PATTERN = /\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})\b/g;
const ISO_DATE_PATTERN = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

class OneCFilterExtractor {
  /**
   * Extract structured filters from user text.
   *
   * @param {string} text - User query text (without @1с prefix)
   * @param {object} context - { currentDate } — defaults to now
   * @returns {{ period: object|null, dateFrom: string|null, dateTo: string|null, groupBy: string|null, raw: string[] }}
   */
  extract(text, context = {}) {
    if (!text || typeof text !== 'string') {
      return { period: null, dateFrom: null, dateTo: null, groupBy: null, raw: [] };
    }

    const lower = text.toLowerCase();
    const now = context.currentDate || new Date();
    const rawFilters = [];
    let period = null;
    let dateFrom = null;
    let dateTo = null;
    let groupBy = null;

    // ── Temporal: relative periods ──

    if (lower.includes('сегодня')) {
      period = { type: 'day', value: 'today' };
      dateFrom = this._formatDate(now);
      dateTo = this._formatDate(now);
      rawFilters.push('сегодня');
    } else if (lower.includes('вчера')) {
      period = { type: 'day', value: 'yesterday' };
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      dateFrom = this._formatDate(yesterday);
      dateTo = this._formatDate(yesterday);
      rawFilters.push('вчера');
    } else if (lower.includes('позавчера')) {
      period = { type: 'day', value: 'day_before_yesterday' };
      const d = new Date(now);
      d.setDate(d.getDate() - 2);
      dateFrom = this._formatDate(d);
      dateTo = this._formatDate(d);
      rawFilters.push('позавчера');
    } else if (lower.match(/за\s+(прошлый|прошлую)\s+год/)) {
      const year = now.getFullYear() - 1;
      period = { type: 'year', value: 'last_year', year };
      dateFrom = `${year}-01-01`;
      dateTo = `${year}-12-31`;
      rawFilters.push('за прошлый год');
    } else if (lower.match(/за\s+(прошлый|прошлую)\s+месяц/)) {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const lastDay = new Date(year, month, 0).getDate();
      period = { type: 'month', value: 'last_month', month, year };
      dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
      dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      rawFilters.push('за прошлый месяц');
    } else if (lower.match(/за\s+(прошлый|прошлую)\s+квартал/)) {
      const q = Math.floor((now.getMonth()) / 3);
      const year = q === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const qMonth = q === 0 ? 10 : (q - 1) * 3 + 1;
      const lastDay = new Date(year, qMonth + 2, 0).getDate();
      period = { type: 'quarter', value: 'last_quarter', quarter: q === 0 ? 4 : q, year };
      dateFrom = `${year}-${String(qMonth).padStart(2, '0')}-01`;
      dateTo = `${year}-${String(qMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      rawFilters.push('за прошлый квартал');
    } else if (lower.match(/за\s+недел/)) {
      period = { type: 'week', value: 'current_week' };
      const dayOfWeek = now.getDay() || 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek + 1);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      dateFrom = this._formatDate(monday);
      dateTo = this._formatDate(sunday);
      rawFilters.push('за неделю');
    } else if (lower.match(/за\s+месяц/)) {
      period = { type: 'month', value: 'current_month' };
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const lastDay = new Date(year, month, 0).getDate();
      dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
      dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      rawFilters.push('за месяц');
    } else if (lower.match(/за\s+квартал/)) {
      const q = Math.floor(now.getMonth() / 3) + 1;
      const qStartMonth = (q - 1) * 3 + 1;
      const lastDay = new Date(now.getFullYear(), qStartMonth + 2, 0).getDate();
      period = { type: 'quarter', value: 'current_quarter', quarter: q };
      dateFrom = `${now.getFullYear()}-${String(qStartMonth).padStart(2, '0')}-01`;
      dateTo = `${now.getFullYear()}-${String(qStartMonth + 2).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      rawFilters.push('за квартал');
    } else if (lower.match(/за\s+год/)) {
      const year = now.getFullYear();
      period = { type: 'year', value: 'current_year', year };
      dateFrom = `${year}-01-01`;
      dateTo = `${year}-12-31`;
      rawFilters.push('за год');
    } else {
      // Check for month name: "за июль", "за январь", etc.
      const monthMatch = lower.match(/за\s+(\S+)/);
      if (monthMatch) {
        const monthWord = monthMatch[1];
        const detectedMonth = this._detectMonth(monthWord);
        if (detectedMonth) {
          const year = now.getFullYear();
          const lastDay = new Date(year, detectedMonth, 0).getDate();
          period = { type: 'month', month: detectedMonth, year, name: monthWord };
          dateFrom = `${year}-${String(detectedMonth).padStart(2, '0')}-01`;
          dateTo = `${year}-${String(detectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
          rawFilters.push(`за ${monthWord}`);
        }
      }
    }

    // ── Temporal: explicit dates ──

    if (!dateFrom) {
      const explicitDates = this._extractExplicitDates(lower);
      if (explicitDates.dateFrom) {
        dateFrom = explicitDates.dateFrom;
        dateTo = explicitDates.dateTo || dateFrom;
        period = { type: 'explicit', dateFrom, dateTo };
        rawFilters.push(...explicitDates.raw);
      }
    }

    // ── GroupBy hint: "по брендам", "по клиентам" ──

    const groupByMatch = lower.match(/по\s+(\S+)(?:\s|,|\.|$)/);
    if (groupByMatch && !lower.match(/за\s/)) {
      groupBy = groupByMatch[1];
      rawFilters.push(`по ${groupBy}`);
    }

    return { period, dateFrom, dateTo, groupBy, raw: rawFilters };
  }

  /**
   * Convert extracted filters to MCP query filter format.
   *
   * @param {object} extracted - Result from extract()
   * @returns {Array<{ field: string, comparison: string, value: string }>}
   */
  toMcpFilters(extracted) {
    if (!extracted) return [];

    const filters = [];

    if (extracted.dateFrom && extracted.dateTo) {
      if (extracted.dateFrom === extracted.dateTo) {
        filters.push({ field: 'Дата', comparison: 'equal', value: extracted.dateFrom });
      } else {
        filters.push({ field: 'Дата', comparison: 'greaterOrEqual', value: extracted.dateFrom });
        filters.push({ field: 'Дата', comparison: 'lessOrEqual', value: extracted.dateTo });
      }
    }

    return filters;
  }

  // ── Private helpers ────────────────────────────────────────────

  _detectMonth(word) {
    for (const [prefix, monthNum] of Object.entries(MONTH_NAMES)) {
      if (word.startsWith(prefix)) {
        return monthNum;
      }
    }
    return null;
  }

  _extractExplicitDates(text) {
    const raw = [];
    let dateFrom = null;
    let dateTo = null;

    // "с DD.MM.YYYY по DD.MM.YYYY" (full dates)
    const rangeMatch = text.match(/с\s+(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})\s+по\s+(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
    if (rangeMatch) {
      dateFrom = this._normalizeDate(rangeMatch[1], rangeMatch[2], rangeMatch[3]);
      dateTo = this._normalizeDate(rangeMatch[4], rangeMatch[5], rangeMatch[6]);
      raw.push('explicit range');
      return { dateFrom, dateTo, raw };
    }

    // "с DD.MM по DD.MM.YYYY" (partial start date — assume current year)
    const rangePartialMatch = text.match(/с\s+(\d{1,2})[.\-/](\d{1,2})\s+по\s+(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
    if (rangePartialMatch) {
      const year = rangePartialMatch[5].length === 2 ? '20' + rangePartialMatch[5] : rangePartialMatch[5];
      dateFrom = this._normalizeDate(rangePartialMatch[1], rangePartialMatch[2], year);
      dateTo = this._normalizeDate(rangePartialMatch[3], rangePartialMatch[4], rangePartialMatch[5]);
      raw.push('explicit range');
      return { dateFrom, dateTo, raw };
    }

    // "с DD.MM.YYYY" (single from date)
    const fromMatch = text.match(/с\s+(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
    if (fromMatch) {
      dateFrom = this._normalizeDate(fromMatch[1], fromMatch[2], fromMatch[3]);
      raw.push('explicit from');
      return { dateFrom, dateTo: null, raw };
    }

    // "DD.MM.YYYY" standalone dates
    let match;
    DATE_PATTERN.lastIndex = 0;
    while ((match = DATE_PATTERN.exec(text)) !== null) {
      const d = this._normalizeDate(match[1], match[2], match[3]);
      if (!dateFrom) {
        dateFrom = d;
      } else if (!dateTo) {
        dateTo = d;
      }
      raw.push('explicit date');
    }

    return { dateFrom, dateTo, raw };
  }

  _normalizeDate(day, month, year) {
    if (year.length === 2) year = '20' + year;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  _formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

module.exports = OneCFilterExtractor;
