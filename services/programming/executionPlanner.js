const ExecutionPlan = require('./ExecutionPlan');

const STEP_PROVIDERS = {
  collect_metadata:      'mcp',
  collect_project_files: 'filesystem',
  collect_examples:      'filesystem',
  collect_rag:           'rag',
  build_prompt:          'internal',
  call_llm:              'openrouter',
  review_result:         'internal'
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
  constructor(providerManager) {
    this.providerManager = providerManager;
  }

  plan(task) {
    if (!task || !task.type) {
      return new ExecutionPlan(null, [], 'unknown');
    }

    const template = PLAN_TEMPLATES[task.type] || PLAN_TEMPLATES.unknown;

    const steps = template.actions.map((action, index) => {
      const providerName = STEP_PROVIDERS[action];
      const provider = this.providerManager ? this.providerManager.get(providerName) : null;

      return {
        order: index + 1,
        action,
        provider: provider ? provider.name : providerName,
        providerDescription: provider ? provider.description : null,
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