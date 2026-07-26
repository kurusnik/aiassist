const PATTERNS = {

  document_count: {
    objectTypes: ['Документ'],
    requiredFields: ['Дата'],
    operations: ['count'],
    keywords: ['документ', 'создан', 'проведен'],
    score: 40,
  },

  document_list: {
    objectTypes: ['Документ'],
    requiredFields: ['Дата'],
    operations: ['list'],
    keywords: ['документ', 'список', 'перечень'],
    score: 40,
  },

  register_sum: {
    objectTypes: ['РегистрНакопления', 'РегистрБухгалтерии'],
    keywords: ['сумма', 'итог', 'оборот'],
    dimensions: ['Номенклатура', 'Сумма'],
    score: 40,
  },

  stock_balance: {
    objectTypes: ['РегистрНакопления'],
    keywords: ['остаток', 'остатки', 'баланс', 'склад'],
    dimensions: ['Номенклатура', 'Склад', 'Партия'],
    score: 40,
    patterns: ['register_balance_pattern', 'warehouse_dimension'],
  },

  batch_tracking: {
    objectTypes: ['РегистрНакопления', 'РегистрСведений'],
    keywords: ['партия', 'серия', 'срок годности', 'гтд', 'сертификат'],
    dimensions: ['Номенклатура', 'Партия', 'Серия', 'СрокГодности'],
    score: 35,
    patterns: ['batch_tracking_pattern'],
  },

  distribution_algorithm: {
    objectTypes: ['Документ', 'ОбщийМодуль'],
    keywords: ['распределение', 'алгоритм', 'механизм', 'логика'],
    score: 30,
    patterns: ['algorithm_pattern'],
    executorHint: 'onec_coder',
  },

};

const PATTERN_BY_OPERATION = Object.keys(PATTERNS).reduce((map, key) => {
  map[key] = PATTERNS[key];
  return map;
}, {});

function findByOperation(operation) {
  return PATTERNS[operation] || null;
}

function findByKeyword(keyword) {
  const lower = keyword.toLowerCase();
  const results = [];
  for (const [name, pattern] of Object.entries(PATTERNS)) {
    if (pattern.keywords && pattern.keywords.some(kw => lower.includes(kw) || kw.includes(lower))) {
      results.push({ operation: name, pattern, matchType: 'keyword' });
    }
  }
  return results;
}

function findByObjectType(objectType) {
  const results = [];
  for (const [name, pattern] of Object.entries(PATTERNS)) {
    if (pattern.objectTypes && pattern.objectTypes.includes(objectType)) {
      results.push({ operation: name, pattern });
    }
  }
  return results;
}

function getAllPatterns() {
  return PATTERNS;
}

module.exports = {
  PATTERNS,
  PATTERN_BY_OPERATION,
  findByOperation,
  findByKeyword,
  findByObjectType,
  getAllPatterns,
};