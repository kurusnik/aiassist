const diagnosticsService = require('../../diagnostics');

class AgentDiagnostics {
  startAgentTrace(trace, agentName) {
    if (!trace) return null;
    return diagnosticsService.startPipelineStep(trace, 'agent');
  }

  finishAgentTrace(trace, metadata = {}) {
    if (!trace) return;
    diagnosticsService.finishPipelineStep(trace, 'agent', {
      agent_type: metadata.agent_type || null,
      execution_id: metadata.execution_id || null,
      lifecycle_state: metadata.lifecycle_state || null,
      ...metadata
    });
  }

  startExecutionTrace(trace) {
    if (!trace) return null;
    return diagnosticsService.startPipelineStep(trace, 'execution');
  }

  finishExecutionTrace(trace, metadata = {}) {
    if (!trace) return;
    diagnosticsService.finishPipelineStep(trace, 'execution', {
      execution_id: metadata.execution_id || null,
      lifecycle_state: metadata.lifecycle_state || null,
      ...metadata
    });
  }

  startResultValidationTrace(trace) {
    if (!trace) return null;
    return diagnosticsService.startPipelineStep(trace, 'result_validation');
  }

  finishResultValidationTrace(trace, metadata = {}) {
    if (!trace) return;
    diagnosticsService.finishPipelineStep(trace, 'result_validation', {
      lifecycle_state: metadata.lifecycle_state || null,
      ...metadata
    });
  }

  startSafetyCheckTrace(trace) {
    if (!trace) return null;
    return diagnosticsService.startPipelineStep(trace, 'safety_check');
  }

  finishSafetyCheckTrace(trace, metadata = {}) {
    if (!trace) return;
    diagnosticsService.finishPipelineStep(trace, 'safety_check', {
      lifecycle_state: metadata.lifecycle_state || null,
      ...metadata
    });
  }

  startPlanningValidationTrace(trace) {
    if (!trace) return null;
    return diagnosticsService.startPipelineStep(trace, 'planning_validation');
  }

  finishPlanningValidationTrace(trace, metadata = {}) {
    if (!trace) return;
    diagnosticsService.finishPipelineStep(trace, 'planning_validation', {
      lifecycle_state: metadata.lifecycle_state || null,
      ...metadata
    });
  }
}

module.exports = new AgentDiagnostics();