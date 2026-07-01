class ExecutionPipeline {
  constructor(providerManager) {
    this.providerManager = providerManager;
  }

  async execute(context) {
    const plan = context.executionPlan;
    if (!plan || !plan.steps || plan.steps.length === 0) {
      context.addLogEntry({
        step: null,
        provider: null,
        status: 'failed',
        message: 'Execution plan is empty'
      });
      return context;
    }

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
          return context;
        }
        continue;
      }

      context.addLogEntry({
        step: step.action,
        provider: step.provider,
        status: 'started',
        message: `Starting ${step.action} via ${step.provider}`
      });

      let result;
      try {
        result = await provider.execute(step, context);
      } catch (err) {
        context.addLogEntry({
          step: step.action,
          provider: step.provider,
          status: 'failed',
          message: err.message
        });
        if (step.required !== false) {
          return context;
        }
        continue;
      }

      if (result && result.success) {
        context.addLogEntry({
          step: step.action,
          provider: step.provider,
          status: 'completed',
          message: result.message || `${step.action} completed`
        });
        context.addData(step.action, result.data || {});
      } else {
        context.addLogEntry({
          step: step.action,
          provider: step.provider,
          status: 'failed',
          message: (result && result.message) || `${step.action} failed`
        });
        if (step.required !== false) {
          return context;
        }
      }
    }

    return context;
  }
}

module.exports = ExecutionPipeline;