const ExecutionPlan = require('../../programming/ExecutionPlan');
const { ACTION_TYPES, ACTION_TARGETS } = require('../../query-intelligence/models/QueryPlan');
const PlanningContext = require('../PlanningContext');

const QUERY_ACTION_TO_EXECUTION_STEP = {
  'retrieve:knowledge': ['search_metadata', 'collect_rag'],
  'retrieve:mcp': ['collect_metadata'],
  'retrieve:programming': ['collect_rag', 'collect_project_files'],
  'execute:mcp': ['get_object_structure', 'query_data', 'describe_metadata'],
  'execute:programming': ['collect_project_files'],
  'generate:llm': ['build_prompt', 'call_llm'],
  'analyze:llm': ['build_prompt', 'call_llm', 'review_result']
};

class QueryPlanTranslator {
  translate(queryPlan, taskContext) {
    const planningContext = new PlanningContext(queryPlan, taskContext);

    if (!queryPlan || !queryPlan.actions || queryPlan.actions.length === 0) {
      planningContext.executionIntent = 'unknown';
      planningContext.actions = [];
      planningContext.confidence = 0;
      return planningContext;
    }

    const executionSteps = [];
    let maxConfidence = 0;
    let combinedSafety = { requiresConfirmation: false, requiresPermission: false, auditLevel: 'none' };

    for (const action of queryPlan.actions) {
      const key = `${action.type}:${action.target}`;
      const mappedSteps = QUERY_ACTION_TO_EXECUTION_STEP[key] || [];

      for (const stepName of mappedSteps) {
        executionSteps.push({
          order: executionSteps.length + 1,
          action: stepName,
          provider: null,
          providerDescription: null,
          required: true,
          sourceAction: action.toJSON()
        });
      }

      if (action.confidence !== null && action.confidence > maxConfidence) {
        maxConfidence = action.confidence;
      }

      if (action.safety) {
        if (action.safety.requiresConfirmation) combinedSafety.requiresConfirmation = true;
        if (action.safety.requiresPermission) combinedSafety.requiresPermission = true;
        if (action.safety.auditLevel === 'escalate') combinedSafety.auditLevel = 'escalate';
        else if (action.safety.auditLevel === 'confirm' && combinedSafety.auditLevel !== 'escalate') combinedSafety.auditLevel = 'confirm';
        else if (action.safety.auditLevel === 'observe' && combinedSafety.auditLevel === 'none') combinedSafety.auditLevel = 'observe';
      }
    }

    planningContext.executionIntent = queryPlan.actions[0] ? queryPlan.actions[0].type : 'unknown';
    planningContext.actions = queryPlan.actions.map(a => a.toJSON());
    planningContext.confidence = maxConfidence || null;
    planningContext.safety = combinedSafety;

    const estimatedComplexity = executionSteps.length <= 3 ? 'low' : executionSteps.length <= 6 ? 'medium' : 'high';
    const executionPlan = new ExecutionPlan(
      taskContext ? taskContext.id || null : null,
      executionSteps,
      estimatedComplexity
    );

    planningContext.metadata.executionPlanId = executionPlan.id;
    planningContext.metadata.executionPlanSteps = executionSteps.length;

    return { planningContext, executionPlan };
  }
}

module.exports = QueryPlanTranslator;