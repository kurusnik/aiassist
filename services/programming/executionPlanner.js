const ExecutionPlan = require('./ExecutionPlan');

const STEP_PROVIDERS = {
  collect_metadata:       'mcp',
  search_metadata:        'mcp',
  get_object_structure:   'mcp',
  describe_metadata:      'mcp',
  collect_project_files:  'filesystem',
  collect_examples:       'filesystem',
  collect_rag:            'rag',
  build_prompt:           'internal',
  call_llm:               'openrouter',
  review_result:          'internal'
};

const METADATA_REQUIRED_TYPES = ['find_object', 'analyze_metadata', 'get_structure'];

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
  find_object: {
    actions: ['search_metadata', 'build_prompt', 'call_llm', 'review_result'],
    complexity: 'low'
  },
  analyze_metadata: {
    actions: ['collect_metadata', 'build_prompt', 'call_llm', 'review_result'],
    complexity: 'medium'
  },
  get_structure: {
    actions: ['get_object_structure', 'build_prompt', 'call_llm', 'review_result'],
    complexity: 'low'
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
    const metadataRequired = METADATA_REQUIRED_TYPES.includes(task.type);
    const metadataActions = ['collect_metadata', 'search_metadata', 'get_object_structure', 'describe_metadata'];

    const steps = template.actions.map((action, index) => {
      const providerName = STEP_PROVIDERS[action];
      const provider = this.providerManager ? this.providerManager.get(providerName) : null;
      const isMetadataAction = metadataActions.includes(action);

      return {
        order: index + 1,
        action,
        provider: provider ? provider.name : providerName,
        providerDescription: provider ? provider.description : null,
        required: isMetadataAction ? metadataRequired : (action !== 'collect_rag')
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