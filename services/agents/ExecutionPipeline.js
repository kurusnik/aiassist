const AgentContext = require('./AgentContext');

const PIPELINE_STEPS = [
  'planning_validation',
  'safety_check',
  'tool_resolution',
  'permission_check',
  'approval_check',
  'mcp_execution',
  'execution',
  'tool_result',
  'execution_graph',
  'result_validation'
];

const ERROR_CODES = {
  PLANNING_INVALID: 'PLANNING_INVALID',
  SAFETY_BLOCKED: 'SAFETY_BLOCKED',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  RESULT_INVALID: 'RESULT_INVALID'
};

class ExecutionPipeline {
  constructor(options = {}) {
    this.name = options.name || 'execution_pipeline';
    this.version = options.version || '1.0';
    this.diagnostics = options.diagnostics || null;
  }

  async execute(agentContext, agentAdapter) {
    if (!(agentContext instanceof AgentContext)) {
      const err = new Error('ExecutionPipeline requires AgentContext');
      err.code = ERROR_CODES.EXECUTION_FAILED;
      throw err;
    }

    const start = Date.now();
    const trace = this.diagnostics
      ? this.diagnostics.createPipelineTrace(
          this.diagnostics.createTraceContext('agent_execution')
        )
      : null;

    const pipelineTrace = {
      pipelineName: this.name,
      startedAt: new Date().toISOString(),
      steps: [],
      result: null,
      error: null
    };

    try {
      await this._recordStep(trace, 'planning_validation', start);
      const stepResult = await agentAdapter.validatePlanning(agentContext);
      await this._finishStep(trace, 'planning_validation', { status: stepResult.passed ? 'completed' : 'failed' });

      if (!stepResult.passed) {
        return this._finalize(pipelineTrace, start, {
          success: false,
          output: null,
          artifacts: [],
          errors: [{
            code: ERROR_CODES.PLANNING_INVALID,
            message: stepResult.reason || 'Planning validation failed by adapter'
          }],
          metrics: { pipelineSteps: PIPELINE_STEPS }
        }, trace);
      }

      await this._recordStep(trace, 'safety_check', start);
      const safety = await agentAdapter.checkSafety(agentContext);
      await this._finishStep(trace, 'safety_check', {
        allowed: safety.allowed,
        requiresConfirmation: safety.requiresConfirmation
      });

      if (!safety.allowed) {
        pipelineTrace.safetyBlocked = true;
        return this._finalize(pipelineTrace, start, {
          success: false,
          output: null,
          artifacts: [],
          errors: [{
            code: ERROR_CODES.SAFETY_BLOCKED,
            message: safety.reason || 'Safety check blocked by adapter',
            details: { requiresConfirmation: safety.requiresConfirmation }
          }],
          metrics: { pipelineSteps: PIPELINE_STEPS }
        }, trace);
      }

      await this._recordStep(trace, 'execution', start);
      const result = await agentAdapter.execute(agentContext);
      await this._finishStep(trace, 'execution', {
        success: result.success !== false
      });

      await this._recordStep(trace, 'result_validation', start);
      const validation = await agentAdapter.validateResult(result);
      await this._finishStep(trace, 'result_validation', {
        status: validation.valid ? 'completed' : 'failed',
        errors: validation.errors
      });

      if (!validation.valid) {
        result.success = false;
        result.errors = result.errors || [];
        result.errors.push({
          code: ERROR_CODES.RESULT_INVALID,
          message: validation.reason || 'Result validation failed by adapter',
          details: validation.errors
        });
      }

      return this._finalize(pipelineTrace, start, result, trace);
    } catch (err) {
      const error = {
        code: err.code || ERROR_CODES.EXECUTION_FAILED,
        message: err.message || String(err)
      };
      const failedResult = {
        success: false,
        output: null,
        artifacts: [],
        errors: [error],
        metrics: { pipelineSteps: PIPELINE_STEPS }
      };
      pipelineTrace.error = err.message;
      if (trace && this.diagnostics) {
        trace.setError(err);
      }
      return this._finalize(pipelineTrace, start, failedResult, trace);
    }
  }

  async _recordStep(trace, stepName, startOffset) {
    if (trace && this.diagnostics) {
      this.diagnostics.startPipelineStep(trace, stepName);
    }
    const step = {
      stepName,
      status: 'running',
      startedAt: Date.now() - startOffset
    };
    return step;
  }

  async _finishStep(trace, stepName, metadata = {}) {
    if (trace && this.diagnostics) {
      this.diagnostics.finishPipelineStep(trace, stepName, metadata);
    }
  }

  _finalize(trace, start, result, pipelineTrace) {
    const totalDuration = Date.now() - start;
    if (result && result.metrics) {
      result.metrics.pipelineDuration = totalDuration;
      result.metrics.pipelineName = this.name;
    }
    if (pipelineTrace && this.diagnostics) {
      this.diagnostics.finalizeTrace(trace ? trace.id : null);
    }
    return result;
  }
}

ExecutionPipeline.ERROR_CODES = ERROR_CODES;
ExecutionPipeline.PIPELINE_STEPS = PIPELINE_STEPS;

module.exports = ExecutionPipeline;