const SEARCH_VERBS = ['найди', 'найти', 'покажи', 'поищи', 'открой', 'где', 'выведи', 'вывести'];

const SEARCH_TYPES = [
  'табличные части', 'табличную часть',
  'регистр накопления', 'регистр сведений', 'регистр расчета',
  'общий модуль',
  'справочник', 'документ', 'регистр', 'обработку', 'обработка',
  'отчет', 'отчёт', 'форму', 'форма',
  'структуру', 'структура', 'структуры',
  'реквизиты', 'реквизит', 'поля', 'состав',
  'накопления', 'сведений', 'расчета'
];

const SEARCH_TYPES_SORTED = [...SEARCH_TYPES].sort((a, b) => b.length - a.length);

const DATA_QUERY_STOP_WORDS = [
  'сколько', 'какая', 'какую', 'какой', 'какие', 'каких',
  'сумма', 'сумму', 'за', 'на', 'по', 'с', 'со', 'в', 'во', 'о', 'об',
  'было', 'были', 'будет', 'есть', 'создано', 'создан', 'сделано',
  'сегодня', 'вчера', 'завтра', 'месяц', 'месяца', 'месяцев',
  'день', 'дня', 'дней', 'неделя', 'недели', 'недель', 'неделе',
  'период', 'периода', 'показать', 'вывести', 'выведи',
  'нужно', 'надо', 'требуется',
  'этот', 'эта', 'это', 'эти', 'этой', 'этом', 'этих', 'этими'
];

const DATE_PATTERN = /^\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}$/;

function detectIntent(text) {
  const lower = text.toLowerCase();
  if (/сколько|какая сумма|на какую сумму/.test(lower)) return 'count';
  if (/покажи|выведи|вывести|показать/.test(lower)) return 'show';
  if (/найди|найти|где|поищи/.test(lower)) return 'find';
  if (/сумма|сумму|итого/.test(lower)) return 'aggregate';
  return 'query';
}

function parseDate(token) {
  if (!DATE_PATTERN.test(token)) return null;
  const sep = token.includes('/') ? '/' : token.includes('.') ? '.' : '-';
  const parts = token.split(sep);
  let d = parts[0], m = parts[1], y = parts[2];
  if (y.length === 2) y = '20' + y;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

const RELATIVE_DATE_MAP = {
  сегодня: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
  вчера: () => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
  завтра: () => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
};

const MONTH_NAMES = {
  января: '01', февраля: '02', марта: '03', апреля: '04',
  мая: '05', июня: '06', июля: '07', августа: '08',
  сентября: '09', октября: '10', ноября: '11', декабря: '12',
  январь: '01', февраль: '02', март: '03', апрель: '04',
  май: '05', июнь: '06', июль: '07', август: '08',
  сентябрь: '09', октябрь: '10', ноябрь: '11', декабрь: '12',
};

function stripLeadingVerb(text) {
  const lower = text.toLowerCase();
  for (const verb of SEARCH_VERBS) {
    if (lower.startsWith(verb)) {
      return text.slice(verb.length).trim();
    }
  }
  return text;
}

function stripTypeWords(text) {
  let result = text;
  let changed = true;
  while (changed) {
    changed = false;
    for (const type of SEARCH_TYPES_SORTED) {
      const regex = new RegExp('^' + type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\S*\\s+', 'i');
      if (regex.test(result)) {
        result = result.replace(regex, '').trim();
        changed = true;
        break;
      }
    }
  }

  const textLower = result.toLowerCase();
  let bestIdx = -1;
  let bestType = null;
  for (const type of SEARCH_TYPES_SORTED) {
    const idx = textLower.lastIndexOf(type);
    if (idx > bestIdx) {
      bestIdx = idx;
      bestType = type;
    }
  }
  if (bestType && bestIdx >= 0) {
    result = result.slice(bestIdx).trim();
    const regex = new RegExp('^' + bestType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\S*\\s*', 'i');
    result = result.replace(regex, '').trim();
  }
  return result;
}

const FEMININE_ENDINGS = ['а', 'ая'];
const MASCULINE_ENDINGS = [];
const STEM_ENDINGS = [];

function generateInflectionForms(word) {
  const forms = [word];
  if (word.length <= 5) return forms;

  const withoutLast1 = word.slice(0, -1);
  const withoutLast2 = word.slice(0, -2);

  for (const ending of FEMININE_ENDINGS) {
    forms.push(withoutLast1 + ending);
  }
  forms.push(withoutLast1);
  forms.push(withoutLast2);

  return [...new Set(forms)];
}

const LEMMA_MAP = {
  реализаций: 'реализация',
  реализации: 'реализация',
  реализацию: 'реализация',
  реализациями: 'реализация',
  приходов: 'приход',
  приходы: 'приход',
  прихода: 'приход',
  расходов: 'расход',
  расходы: 'расход',
  расхода: 'расход',
  продаж: 'продажа',
  продажи: 'продажа',
  продажу: 'продажа',
};

class OneCQueryNormalizer {
  normalize(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return { searchText: '', dates: [], intent: 'query', entities: [], lemmas: [], originalText: rawText || '' };
    }

    const trimmed = rawText.trim();
    const lower = trimmed.toLowerCase();
    const dates = [];
    const words = trimmed.split(/\s+/);
    const nonDateWords = [];

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (RELATIVE_DATE_MAP[word]) {
        dates.push(RELATIVE_DATE_MAP[word]());
        continue;
      }

      const monthMatch = MONTH_NAMES[word.toLowerCase()];
      if (monthMatch) {
        if (i > 0) {
          const prev = words[i - 1].toLowerCase();
          if (prev === 'за' || prev === 'с' || prev === 'по') {
            const now = new Date();
            dates.push(`${now.getFullYear()}-${monthMatch}-01`);
          }
        }
        continue;
      }

      const parsed = parseDate(word);
      if (parsed) {
        dates.push(parsed);
        continue;
      }

      nonDateWords.push(word);
    }

    const intent = detectIntent(trimmed);

    const stopWordsSet = new Set(DATA_QUERY_STOP_WORDS);
    const cleaned = nonDateWords.filter(w => {
      const lw = w.toLowerCase();
      return w.length > 2 && !stopWordsSet.has(lw);
    });

    let searchText = cleaned.join(' ');
    searchText = stripLeadingVerb(searchText);
    searchText = stripTypeWords(searchText);

    const rawWords = searchText.split(/\s+/).filter(w => w.length > 2);

    const lemmas = [];
    const entities = [];
    for (const word of rawWords) {
      const lw = word.toLowerCase();
      const lemma = LEMMA_MAP[lw] || lw;
      lemmas.push(lemma);
      const forms = generateInflectionForms(lw);
      entities.push(...forms);
    }

    return {
      searchText: searchText || '',
      lemmas: [...new Set(lemmas)],
      dates: [...new Set(dates)],
      intent,
      entities: [...new Set(entities)],
      originalText: trimmed
    };
  }
}

OneCQueryNormalizer.SEARCH_VERBS = SEARCH_VERBS;
OneCQueryNormalizer.SEARCH_TYPES = SEARCH_TYPES;
OneCQueryNormalizer.DATA_QUERY_STOP_WORDS = DATA_QUERY_STOP_WORDS;

module.exports = OneCQueryNormalizer;