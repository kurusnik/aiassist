const LANGUAGE_RULES = [
  {
    language: 'bsl',
    keywords: ['1с', '1с8', 'bsl', 'onec', '1c',
      'документ', 'справочник', 'регистр', 'форма', 'реквизит',
      'табличная часть', 'проведение', 'обработка проведения',
      'запрос', 'модуль объекта', 'менеджер объекта', 'общий модуль',
      'документооборот', 'бухгалтер']
  },
  {
    language: 'typescript',
    keywords: ['typescript', 'tsx', '.ts']
  },
  {
    language: 'javascript',
    keywords: ['javascript', 'jsx', 'node', 'react', 'vue', 'angular', 'express']
  },
  {
    language: 'python',
    keywords: ['python', 'питон', 'django', 'flask', 'pandas', 'numpy']
  },
  {
    language: 'sql',
    keywords: ['sql', 'запрос', 'postgresql', 'mysql', 'база данных', 'бд']
  }
];

module.exports = LANGUAGE_RULES;