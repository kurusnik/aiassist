const QueryPlanTranslator = require('../planning/translators/QueryPlanTranslator');
const PlanningContext = require('../planning/PlanningContext');
const AgentContext = require('../agents/AgentContext');

class PlanningBridge {
  constructor() {
    this.translator = new QueryPlanTranslator();
  }

  buildAgentContext(queryContext, options = {}) {
    const taskContext = options.taskContext || null;

    const translation = this.translator.translate(
      queryContext ? queryContext.queryPlan : null,
      taskContext
    );

    const planningContext = translation.planningContext || translation;
    const executionPlan = translation.executionPlan || null;

    const agentContext = new AgentContext({
      traceId: options.traceId || undefined,
      queryContext: queryContext,
      planningContext: planningContext,
      candidates: options.candidates || [],
      metadata: {
        executionPlanId: executionPlan ? executionPlan.id : null,
        ...options.metadata
      }
    });

    return { agentContext, planningContext, executionPlan };
  }

  resolveIntent(queryContext) {
    if (!queryContext || !queryContext.queryPlan) return 'unknown';
    const actions = queryContext.queryPlan.actions || [];
    if (actions.length === 0) return 'unknown';

    const best = actions.reduce((a, b) => (a.priority > b.priority ? a : b));
    return `${best.type}:${best.target}`;
  }
}

module.exports = PlanningBridge;