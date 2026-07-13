const ProgrammingTrace = require('./ProgrammingTrace');

const LIFECYCLE_STATES = {
  CREATED: 'created',
  PLANNED: 'planned',
  EXECUTING: 'executing',
  MCP_COMPLETED: 'mcp_completed',
  LLM_PROCESSING: 'llm_processing',
  COMPLETED: 'completed',
  ERROR: 'error'
};

class ExecutionPipeline {
  constructor(providerManager) {
    this.providerManager = providerManager;
    this.trace = null;
  }

  async execute(context) {
    this.trace = new ProgrammingTrace();
    this.trace.start();

    const plan = context.plan || context.executionPlan;
    if (!plan || !plan.steps || plan.steps.length === 0) {
      context.status = LIFECYCLE_STATES.ERROR;
      context.addLogEntry({
        step: null,
        provider: null,
        status: 'failed',
        message: 'Execution plan is empty'
      });
      this.trace.setTask(context.task, 0);
      this.trace.fail();
      return context;
    }

    context.status = LIFECYCLE_STATES.PLANNED;
    context.steps = plan.steps;

    const mcpActions = ['collect_metadata', 'search_metadata', 'get_object_structure', 'describe_metadata'];
    let hasMcpSteps = false;
    let hasLlmStep = false;

    for (const step of plan.steps) {
      const provider = this.providerManager.get(step.provider);

      if (!provider) {
        context.addLogEntry({
          step: step.action,
          provider: step.provider,
          status: 'failed',
          message: `Provider "${step.provider}" not found`
        });
        if (step.required !== false) {
          context.status = LIFECYCLE_STATES.ERROR;
          this.trace.fail();
          return context;
        }
        continue;
      }

      if (!provider.capabilities.includes(step.action)) {
        context.addLogEntry({
          step: step.action,
          provider: step.provider,
          status: 'skipped',
          message: `Provider "${step.provider}" does not support action "${step.action}"`
        });
        if (step.required !== false) {
          context.status = LIFECYCLE_STATES.ERROR;
          this.trace.fail();
          return context;
        }
        continue;
      }

      context.status = LIFECYCLE_STATES.EXECUTING;
      context.addLogEntry({
        step: step.action,
        provider: step.provider,
        status: 'started',
        message: `Starting ${step.action} via ${step.provider}`
      });

      const stepStartTime = Date.now();
      let result;

      try {
        result = await provider.execute(step, context);
      } catch (err) {
        context.addLogEntry({
          step: step.action,
          provider: step.provider,
          status: 'failed',
          message: err.message,
          duration: Date.now() - stepStartTime
        });
        if (step.required !== false) {
          context.status = LIFECYCLE_STATES.ERROR;
          this.trace.fail();
          return context;
        }
        continue;
      }

      const stepDuration = Date.now() - stepStartTime;

      if (result && result.success) {
        context.addLogEntry({
          step: step.action,
          provider: step.provider,
          status: 'completed',
          duration: stepDuration,
          message: result.message || `${step.action} completed`
        });

        context.addData(step.action, result.data || {});

        const traceStep = {
          order: step.order,
          action: step.action,
          provider: step.provider,
          status: 'completed',
          duration: stepDuration
        };
        this.trace.addStep(traceStep);

        if (mcpActions.includes(step.action)) {
          hasMcpSteps = true;
          this.trace.addMcpCall({
            tool: step.action,
            action: step.action,
            status: 'completed',
            duration: stepDuration
          });
          context.status = LIFECYCLE_STATES.MCP_COMPLETED;
        }

        if (step.action === 'call_llm') {
          hasLlmStep = true;
          context.status = LIFECYCLE_STATES.LLM_PROCESSING;
        }
      } else {
        const failMsg = (result && result.message) || `${step.action} failed`;
        context.addLogEntry({
          step: step.action,
          provider: step.provider,
          status: 'failed',
          duration: stepDuration,
          message: failMsg
        });
        if (step.required !== false) {
          context.status = LIFECYCLE_STATES.ERROR;
          this.trace.fail();
          return context;
        }
      }
    }

    context.status = LIFECYCLE_STATES.COMPLETED;
    this.trace.setTask(context.task, context.task ? 0.8 : 0);
    this.trace.finish();

    return context;
  }

  getTrace() {
    return this.trace;
  }
}

module.exports = ExecutionPipeline;
module.exports.LIFECYCLE_STATES = LIFECYCLE_STATES;