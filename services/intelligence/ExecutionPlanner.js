const PLANS = {
  onec_query: {
    data_query: {
      steps: ['resolve_metadata', 'build_query', 'execute_mcp', 'format_result']
    }
  },
  onec_coder: {
    explain: {
      steps: ['search_code', 'analyze_logic', 'generate_solution']
    },
    development_task: {
      steps: ['search_code', 'analyze_logic', 'generate_solution']
    }
  },
  general_chat: {
    chat: {
      steps: []
    }
  }
};

const FALLBACK_STEPS = [];

class ExecutionPlanner {
  createPlan(intent) {
    if (!intent || !intent.executor) {
      return { executor: 'general_chat', steps: [] };
    }

    const executor = intent.executor;
    const intentType = intent.intent || 'chat';
    const planKey = this._resolvePlanKey(executor, intentType, intent.actions);

    const plan = PLANS[executor]?.[planKey];
    if (plan) {
      const result = { executor, steps: plan.steps };

      console.log(`[ExecutionPlanner] intent: ${intentType}`);
      console.log(`[ExecutionPlanner] plan: ${JSON.stringify(result.steps)}`);
      console.log(`[ExecutionPlanner] executor: ${executor}`);

      return result;
    }

    const fallback = { executor, steps: FALLBACK_STEPS };

    console.log(`[ExecutionPlanner] intent: ${intentType} (no plan — fallback)`);
    console.log(`[ExecutionPlanner] plan: ${JSON.stringify(fallback.steps)}`);
    console.log(`[ExecutionPlanner] executor: ${executor}`);

    return fallback;
  }

  _resolvePlanKey(executor, intentType, actions) {
    if (executor === 'onec_coder' && intentType === 'explain') return 'explain';
    if (executor === 'onec_coder' && intentType === 'development_task') return 'development_task';
    if (executor === 'onec_query') return 'data_query';
    if (executor === 'general_chat') return 'chat';
    return null;
  }
}

module.exports = ExecutionPlanner;