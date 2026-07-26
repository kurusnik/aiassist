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
    const executedStages = [];

    console.log(`[Pipeline Pre] ${JSON.stringify({
      hasPlan: !!plan,
      stepsCount: plan && plan.steps ? plan.steps.length : 0,
      stepsList: plan && plan.steps ? plan.steps.map(s => ({ action: s.action, provider: s.provider, required: s.required })) : [],
      taskType: context.task ? context.task.type : 'none',
      taskDomain: context.task ? context.task.domain : 'none',
      taskOriginal: context.task ? (context.task.originalRequest || '').slice(0, 100) : 'none'
    })}`);

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

    console.log(`[ExecutionPipeline] Starting ${plan.steps.length} steps for task=${context.task ? context.task.type : 'unknown'}`);

    const mcpActions = ['collect_metadata', 'search_metadata', 'get_object_structure', 'describe_metadata', 'query_data'];
    let hasMcpSteps = false;
    let hasLlmStep = false;

    for (const step of plan.steps) {
      const provider = this.providerManager.get(step.provider);

      console.log(`[Pipeline PreStage] ${JSON.stringify({
        stage: step.action,
        provider: step.provider,
        required: step.required,
        contextStatus: context.status,
        inputKeys: Object.keys(context.collectedData || {})
      })}`);

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
          console.log(`[Pipeline EarlyExit] providerNotFound stage=${step.action} required=${step.required}`);
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
          console.log(`[Pipeline EarlyExit] capabilityNotSupported stage=${step.action} provider=${step.provider} required=${step.required}`);
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
          console.log(`[Pipeline EarlyExit] exception stage=${step.action} error=${err.message}`);
          return context;
        }
        continue;
      }

      const stepDuration = Date.now() - stepStartTime;
      executedStages.push(step.action);

      const contextKeysAfter = Object.keys(context).filter(k => !['executionLog', 'collectedData', 'mcpResults', 'stepResults', 'metadata'].includes(k));
      const resultBefore = !!context.result;
      const llmBefore = !!context.llmResponse;

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

        console.log(`[Pipeline PostStage] ${JSON.stringify({
          stage: step.action,
          success: true,
          duration: stepDuration,
          outputKeys: result && result.data ? Object.keys(result.data) : [],
          resultChanged: !!context.result !== resultBefore,
          llmChanged: !!context.llmResponse !== llmBefore,
          contextKeys: contextKeysAfter,
          contextStatus: context.status,
          collectedDataKeys: Object.keys(context.collectedData || {}),
          mcpResultsKeys: Object.keys(context.mcpResults || {})
        })}`);
      } else {
        const failMsg = (result && result.message) || `${step.action} failed`;
        context.addLogEntry({
          step: step.action,
          provider: step.provider,
          status: 'failed',
          duration: stepDuration,
          message: failMsg
        });
        console.log(`[Pipeline PostStage] ${JSON.stringify({
          stage: step.action,
          success: false,
          duration: stepDuration,
          message: failMsg,
          required: step.required,
          resultChanged: !!context.result !== resultBefore,
          contextKeys: contextKeysAfter,
          contextStatus: context.status
        })}`);
        if (step.required !== false) {
          context.status = LIFECYCLE_STATES.ERROR;
          this.trace.fail();
          console.log(`[Pipeline EarlyExit] requiredStepFailed stage=${step.action} message="${failMsg}"`);
          return context;
        }
      }
    }

    context.status = LIFECYCLE_STATES.COMPLETED;
    this.trace.setTask(context.task, context.task ? 0.8 : 0);
    this.trace.finish();

    console.log(`[Pipeline Final] ${JSON.stringify({
      status: context.status,
      stepsCompleted: plan.steps.length,
      executedStages,
      hasResult: !!context.result,
      resultInstance: context.result ? context.result.constructor.name : null,
      hasLlmResponse: !!context.llmResponse,
      hasPrompt: !!context.prompt,
      hasReview: !!context.review,
      mcpResultsKeys: Object.keys(context.mcpResults || {}),
      collectedDataKeys: Object.keys(context.collectedData || {}),
      stepResultsKeys: Object.keys(context.stepResults || {})
    })}`);

    return context;
  }

  getTrace() {
    return this.trace;
  }
}

module.exports = ExecutionPipeline;
module.exports.LIFECYCLE_STATES = LIFECYCLE_STATES;