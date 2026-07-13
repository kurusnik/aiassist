const ProgrammingReview = require('./ProgrammingReview');

const LANGUAGE_CONSTRUCTS = {
  bsl: {
    keywords: ['Процедура', 'Функция', 'КонецПроцедуры'],
    keywordsLower: ['процедура', 'функция', 'конецпроцедуры']
  },
  sql: {
    keywords: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    keywordsLower: ['select', 'insert', 'update', 'delete']
  },
  javascript: {
    keywords: ['function', 'const', 'class'],
    keywordsLower: ['function', 'const', 'class']
  },
  typescript: {
    keywords: ['interface', 'type', 'class'],
    keywordsLower: ['interface', 'type', 'class']
  }
};

const REQUEST_KEYWORDS_RU = [
  'сообщить', 'привет', 'таблица', 'форма', 'обработка', 'отчёт',
  'документ', 'справочник', 'регистр', 'запрос', 'печать',
  'создать', 'добавить', 'удалить', 'изменить', 'найти'
];

class Reviewer {
  review(context) {
    const review = new ProgrammingReview();
    const task = context.task || {};
    const llmData = context.llmResponse || context.getData('call_llm') || {};
    const code = llmData.code || '';
    const resultObj = context.result || {};
    const explanation = llmData.explanation || resultObj.explanation || '';
    const language = (task.language || 'unknown').toLowerCase();
    const originalRequest = (task.originalRequest || '').toLowerCase();

    let score = 100;

    if (!code || code.trim().length === 0) {
      review.errors.push('No code provided in the result');
      score -= 50;
    } else {
      if (language !== 'unknown' && LANGUAGE_CONSTRUCTS[language]) {
        const constructs = LANGUAGE_CONSTRUCTS[language];
        const codeLower = code.toLowerCase();
        for (const keyword of constructs.keywordsLower) {
          if (!codeLower.includes(keyword)) {
            review.warnings.push(`Expected language construct not found: "${keyword}"`);
            score -= 5;
          }
        }
      }

      if (originalRequest.length > 0) {
        const matchedRequestKeywords = REQUEST_KEYWORDS_RU.filter(kw => originalRequest.includes(kw));
        if (matchedRequestKeywords.length > 0) {
          const codeLower = code.toLowerCase();
          for (const keyword of matchedRequestKeywords) {
            const codeRelevance = this._findRelevance(codeLower, keyword);
            if (!codeRelevance) {
              review.warnings.push(`Request mentions "${keyword}" but no corresponding construct found in code`);
              score -= 5;
            }
          }
        }
      }
    }

    if (!explanation || explanation.trim().length === 0) {
      review.warnings.push('No explanation provided');
      score -= 10;
    }

    review.score = Math.max(0, Math.min(100, score));
    review.passed = review.errors.length === 0;

    if (review.passed && review.score >= 80) {
      review.recommendations.push('Result quality is acceptable');
    } else if (review.passed) {
      review.recommendations.push('Consider addressing warnings to improve quality');
    }

    context.review = review;

    return review;
  }

  _findRelevance(codeLower, keyword) {
    if (codeLower.includes(keyword)) {
      return true;
    }
    const variants = this._getKeywordVariants(keyword);
    return variants.some(v => codeLower.includes(v));
  }

  _getKeywordVariants(keyword) {
    const map = {
      'сообщить': ['сообщи', 'сказать', 'вывести', 'msg', 'message', 'alert', 'лог', 'log', 'write'],
      'привет': ['привет', 'hello', 'greet', 'добр'],
      'таблица': ['таблиц', 'table', 'grid', 'list', 'список', 'массив', 'array'],
      'форма': ['форм', 'form', 'dialog', 'окн', 'window', 'ui'],
      'обработка': ['обработк', 'process', 'handler', 'handle', 'обраб'],
      'отчёт': ['отчёт', 'отчет', 'report', 'print'],
      'документ': ['документ', 'document', 'doc'],
      'справочник': ['справочник', 'catalog', 'directory', 'ref'],
      'регистр': ['регистр', 'register', 'reg'],
      'запрос': ['запрос', 'query', 'select', 'sql'],
      'печать': ['печат', 'print', 'prn'],
      'создать': ['созда', 'create', 'new', 'make', 'build', 'generate'],
      'добавить': ['добав', 'add', 'append', 'push', 'insert'],
      'удалить': ['удал', 'delete', 'remove', 'drop', 'clear'],
      'изменить': ['измен', 'change', 'modify', 'update', 'edit', 'alter'],
      'найти': ['найт', 'find', 'search', 'lookup', 'get', 'seek']
    };
    return map[keyword] || [];
  }
}

module.exports = Reviewer;