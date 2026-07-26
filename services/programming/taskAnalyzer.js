const ProgrammingTask = require('./Task');
const TYPE_RULES = require('./rules/typeRules');
const LANGUAGE_RULES = require('./rules/languageRules');
const DOMAIN_RULES = require('./rules/domainRules');

const METADATA_REQUIRED_TYPES = ['find_object', 'analyze_metadata', 'get_structure'];

// Intent keywords — stems handle Russian inflection (структур → структура, структуру, структуры)
const GET_STRUCTURE_INTENT = [
  'структур', 'реквизит', 'поля', 'состав',
  'табличн',   // табличная часть, табличные части, табличную часть
  'измерени', 'ресурс',
  'типы данных', 'типов данных',
  'свойств объекта', 'свойств'
];

const FIND_OBJECT_INTENT = [
  'найди', 'существует', 'есть ли',
  'покажи объект', 'что такое', 'описание объекта'
];

const DATA_QUERY_INTENT = [
  'сколько', 'какая сумма', 'какую сумму', 'на какую сумму',
  'за период', 'за месяц', 'за день', 'за неделю',
  'покажи данные', 'вывести данные'
];

const DOCUMENT_ANALYSIS_INTENT = [
  'проанализируй файл', 'проанализируй документ',
  'прочитай файл', 'прочитай документ',
  'анализ файла', 'анализ документа',
  'содержимое файла', 'содержимое документа',
  'открой файл', 'прочитай readme',
  'analyze file', 'read file', 'summarize file',
  'explain file', 'show file content'
];

function hasIntent(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

function extractTitle(text) {
  const cleaned = text.replace(/^(напиши|создай|сделай|разработай|объясни|проверь|измени|добавь|доработай|реализуй|модифицируй|расширь)\s*/i, '');
  return cleaned.length > 100 ? cleaned.substring(0, 100) + '...' : cleaned;
}

function classify(text, rules) {
  const lower = text.toLowerCase();
  let bestRule = null;
  let bestScore = 0;

  for (const rule of rules) {
    let score = 0;
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword)) {
        score += 1;
      }
    }
    if (rule.subkeywords) {
      for (const sub of rule.subkeywords) {
        if (lower.includes(sub)) {
          score += 2;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  }

  return bestRule;
}

class TaskAnalyzer {
  analyze(text) {
    if (!text || typeof text !== 'string') {
      return new ProgrammingTask('unknown', {
        title: null,
        language: 'unknown',
        domain: 'general',
        originalRequest: text || ''
      });
    }

    // 0. @1c prefix → expert_1c, strip prefix for downstream analysis
    let analysisText = text;
    const expertMatch = text.match(/^@1[сcСC]\s+/);
    if (expertMatch) {
      analysisText = text.slice(expertMatch[0].length);
      return new ProgrammingTask('expert_1c', {
        title: extractTitle(analysisText),
        language: 'bsl',
        domain: '1c',
        originalRequest: analysisText
      });
    }

    // 1. Intent pre-check before scoring
    const lowerText = analysisText.toLowerCase();

    if (hasIntent(lowerText, GET_STRUCTURE_INTENT)) {
      return new ProgrammingTask('get_structure', {
        title: extractTitle(text),
        language: 'bsl',
        domain: '1c',
        originalRequest: text
      });
    }

    if (hasIntent(lowerText, FIND_OBJECT_INTENT)) {
      return new ProgrammingTask('find_object', {
        title: extractTitle(text),
        language: 'bsl',
        domain: '1c',
        originalRequest: text
      });
    }

    if (hasIntent(lowerText, DATA_QUERY_INTENT)) {
      return new ProgrammingTask('data_query', {
        title: extractTitle(text),
        language: 'bsl',
        domain: '1c',
        originalRequest: text
      });
    }

    if (hasIntent(lowerText, DOCUMENT_ANALYSIS_INTENT)) {
      return new ProgrammingTask('analyze_file', {
        title: extractTitle(text),
        language: 'unknown',
        domain: 'general',
        originalRequest: text
      });
    }

    // 2. Fallback: existing scoring
    const typeRule = classify(text, TYPE_RULES);
    const languageRule = classify(text, LANGUAGE_RULES);
    const domainRule = classify(text, DOMAIN_RULES);

    let type = typeRule ? typeRule.type : 'unknown';
    const language = languageRule ? languageRule.language : 'unknown';
    const domain = domainRule ? domainRule.domain : 'general';

    // Metadata types require bsl + 1c context validation
    if (METADATA_REQUIRED_TYPES.includes(type)) {
      const hasBslContext = language === 'bsl' || domain === '1c';
      if (!hasBslContext) {
        type = 'unknown';
      }
    }

    const title = extractTitle(text);

    return new ProgrammingTask(type, {
      title,
      language,
      domain,
      originalRequest: text
    });
  }
}

module.exports = TaskAnalyzer;