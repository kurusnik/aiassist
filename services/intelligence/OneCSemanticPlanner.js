const OPERATION_MAP = {
  count:         { semanticOp: 'document_count',    strategy: 'document' },
  list:          { semanticOp: 'document_list',     strategy: 'document' },
  sum:           { semanticOp: 'register_sum',       strategy: 'register' },
  stock_balance: { semanticOp: 'stock_balance',     strategy: 'register' },
  create:        { semanticOp: 'object_create',     strategy: 'metadata' },
  modify:        { semanticOp: 'object_modify',     strategy: 'metadata' },
  explain:       { semanticOp: 'code_explanation',  strategy: 'metadata' },
};

const INTENT_HINTS = {
  data_query: {
    document: {
      preferredTypes: ['Документ'],
      keywords: ['документ'],
      dimensions: ['Дата', 'Сумма'],
    },
    register: {
      preferredTypes: ['РегистрНакопления'],
      keywords: ['остатки', 'движения'],
      dimensions: ['Номенклатура', 'Количество'],
      metrics: ['Количество', 'Сумма'],
    },
  },
  development_task: {
    metadata: {
      preferredTypes: ['Справочник', 'Документ', 'РегистрНакопления', 'РегистрСведений'],
      keywords: [],
    },
  },
  explain: {
    metadata: {
      preferredTypes: ['Справочник', 'Документ', 'РегистрНакопления', 'РегистрСведений'],
      keywords: ['механизм', 'алгоритм', 'логика'],
    },
  },
};

const EXECUTOR_TASK_TYPE = {
  onec_query:   'data_query',
  onec_coder:   'explain_code',
  general_chat: 'chat',
};

class OneCSemanticPlanner {
  analyze(interpreterResult) {
    if (!interpreterResult || !interpreterResult.executor) {
      return {
        executor: 'general_chat',
        taskType: 'chat',
        semanticOperation: 'chat',
        searchStrategy: null,
        hints: {},
      };
    }

    const { intent, entity, executor } = interpreterResult;
    const operation = interpreterResult.operation ||
      (intent === 'explain' ? 'explain' : null);
    const opConfig = OPERATION_MAP[operation] || { semanticOp: 'query', strategy: 'document' };
    const { semanticOp, strategy } = opConfig;

    const intentHints = (INTENT_HINTS[intent] || INTENT_HINTS.explain);
    const strategyHints = intentHints[strategy] || intentHints.metadata || {};

    const taskType = EXECUTOR_TASK_TYPE[executor] || 'expert_1c';

    const result = {
      executor,
      taskType,
      semanticOperation: semanticOp,
      searchStrategy: strategy,
      entity: interpreterResult.entity || null,
      // P0-2: Propagate filters from interpreter through the pipeline
      filters: interpreterResult.filters || {},
      hints: {
        preferredTypes: strategyHints.preferredTypes || [],
        keywords: entity ? [entity.toLowerCase()] : (strategyHints.keywords || []),
        dimensions: strategyHints.dimensions || [],
        metrics: strategyHints.metrics || [],
      },
    };

    console.log('[SemanticPlanner]');
    console.log('  input:  ' + JSON.stringify(interpreterResult));
    console.log('  output: ' + JSON.stringify(result));

    return result;
  }
}

module.exports = OneCSemanticPlanner;