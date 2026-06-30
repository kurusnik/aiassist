const ExecutionPlan = require('./ExecutionPlan');

const ACTION_DEFINITIONS = {
  collect_metadata:      { order: 1, provider: 'mcp',        description: 'Сбор метаданных через MCP' },
  collect_project_files: { order: 2, provider: 'filesystem',  description: 'Чтение файлов проекта' },
  collect_examples:      { order: 3, provider: 'filesystem',  description: 'Поиск примеров в проекте' },
  collect_rag:           { order: 4, provider: 'rag',         description: 'Поиск в базе знаний' },
  build_prompt:          { order: 5, provider: 'internal',    description: 'Построение промпта' },
  call_llm:              { order: 6, provider: 'openrouter',  description: 'Отправка запроса в LLM' },
  review_result:         { order: 7, provider: 'internal',    description: 'Проверка результата' }
};

const PLAN_TEMPLATES = {
  create_processor: {
    actions: ['collect_metadata', 'collect_examples', 'build_prompt', 'call_llm', 'review_result'],
    complexity: 'high'
  },
  create_report: {
    actions: ['collect_metadata', 'collect_examples', 'build_prompt', 'call_llm', 'review_result'],
    complexity: 'high'
  },
  modify_code: {
    actions: ['collect_project_files', 'collect_rag', 'build_prompt', 'call_llm', 'review_result'],
    complexity: 'medium'
  },
  explain_code: {
    actions: ['collect_project_files', 'build_prompt', 'call_llm', 'review_result'],
    complexity: 'low'
  },
  review_code: {
    actions: ['collect_project_files', 'build_prompt', 'call_llm', 'review_result'],
    complexity: 'low'
  },
  find_bug: {
    actions: ['collect_project_files', 'collect_examples', 'build_prompt', 'call_llm', 'review_result'],
    complexity: 'medium'
  },
  unknown: {
    actions: ['build_prompt', 'call_llm', 'review_result'],
    complexity: 'low'
  }
};

class ExecutionPlanner {
  plan(task) {
    if (!task || !task.type) {
      return new ExecutionPlan(null, [], 'unknown');
    }

    const template = PLAN_TEMPLATES[task.type] || PLAN_TEMPLATES.unknown;

    const steps = template.actions.map((action, index) => {
      const def = ACTION_DEFINITIONS[action];
      return {
        order: index + 1,
        action,
        provider: def ? def.provider : 'unknown',
        required: action !== 'collect_rag'
      };
    });

    return new ExecutionPlan(
      task.id,
      steps,
      template.complexity
    );
  }
}

module.exports = ExecutionPlanner;