const AgentContext = require('../agents/AgentContext');
const AgentResult = require('../agents/AgentResult');
const AgentRuntime = require('../agents/AgentRuntime');
const programmingService = require('./index');

class ProgrammingAgentAdapter {
  constructor() {
    this.runtime = new AgentRuntime({
      name: 'programming_agent',
      version: '1.0',
      type: 'programming'
    });
    this.safetyChecker = null;
    this.resultValidator = null;
  }

  async validatePlanning(agentContext) {
    if (!agentContext.planningContext) {
      return { passed: false, reason: 'No planning context in AgentContext' };
    }
    if (!agentContext.planningContext.executionIntent) {
      return { passed: false, reason: 'No execution intent in planning context' };
    }
    return { passed: true };
  }

  async checkSafety(agentContext) {
    if (!this.safetyChecker) {
      return { allowed: true, requiresConfirmation: false, reason: null };
    }
    return this.safetyChecker.checkContext(agentContext);
  }

  async validateResult(result) {
    if (this.resultValidator) {
      return this.resultValidator(result);
    }
    if (!result) {
      return { valid: false, reason: 'Execution produced no result', errors: ['No result object returned'] };
    }
    return { valid: true };
  }

  async execute(agentContext) {
    if (!(agentContext instanceof AgentContext)) {
      throw new Error('ProgrammingAgentAdapter requires AgentContext');
    }

    return this.runtime.execute(agentContext, async (ctx) => {
      const agentResult = new AgentResult();

      try {
        const queryContext = ctx.queryContext;
        const rawQuery = queryContext ? (queryContext.rawQuery || '') : '';
        const planningContext = ctx.planningContext;
        const projectId = ctx.metadata.projectId || null;

        const programmingResult = await programmingService.executePipeline(rawQuery, projectId);

        agentResult.success = programmingResult.success;
        agentResult.output = {
          code: programmingResult.code,
          explanation: programmingResult.explanation
        };

        if (programmingResult.code) {
          agentResult.addArtifact({
            type: 'code',
            content: programmingResult.code,
            language: planningContext && planningContext.taskContext
              ? planningContext.taskContext.language || 'unknown' : 'unknown',
            metadata: programmingResult.metadata || {}
          });
        }

        if (programmingResult.errors && programmingResult.errors.length > 0) {
          for (const e of programmingResult.errors) {
            agentResult.addError({
              code: 'PROGRAMMING_ERROR',
              message: e.message || String(e)
            });
          }
        }

        agentResult.metrics.executionMetadata = programmingResult.metadata || {};
      } catch (err) {
        agentResult.success = false;
        agentResult.addError({
          code: 'PROGRAMMING_ADAPTER_ERROR',
          message: err.message || String(err)
        });
      }

      return agentResult;
    });
  }

  getStatus() {
    return {
      adapter: 'programming_agent',
      runtime: this.runtime.getStatus(),
      programming: programmingService.getStatus()
    };
  }
}

module.exports = new ProgrammingAgentAdapter();
module.exports.ProgrammingAgentAdapter = ProgrammingAgentAdapter;