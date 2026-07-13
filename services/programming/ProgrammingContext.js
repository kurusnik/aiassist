const ctxId = (() => {
  let counter = 0;
  return () => `ctx_${++counter}`;
})();

class ProgrammingContext {
  constructor(options = {}) {
    this.id = options.id || ctxId();

    this.task = null;
    this.domain = 'general';
    this.language = 'unknown';
    this.userRequest = null;

    this.plan = null;
    this.steps = [];
    this.stepResults = {};

    this.mcpResults = {};

    this.metadata = {};

    this.prompt = null;

    this.llmResponse = null;

    this.review = null;

    this.result = null;

    this.status = 'created';

    this.executionLog = [];
    this.projectId = null;
    this.projectContext = null;

    this.collectedData = {};
    this.executionPlan = null;
  }

  setTask(task) {
    this.task = task;
    if (task) {
      this.domain = task.domain || 'general';
      this.language = task.language || 'unknown';
      this.userRequest = task.originalRequest || null;
    }
  }

  setPlan(plan) {
    this.plan = plan;
    this.executionPlan = plan;
    if (plan && plan.steps) {
      this.steps = plan.steps;
    }
  }

  addData(source, data) {
    this.collectedData[source] = data;
    this.stepResults[source] = data;

    const mcpSources = ['collect_metadata', 'search_metadata', 'get_object_structure', 'describe_metadata'];
    if (mcpSources.includes(source)) {
      this.mcpResults[source] = data;
    }

    if (source === 'call_llm') {
      this.llmResponse = data;
    }
  }

  getData(source) {
    if (source in this.stepResults) return this.stepResults[source];
    if (source in this.collectedData) return this.collectedData[source];
    if (source === 'call_llm') return this.llmResponse;
    return null;
  }

  setPrompt(prompt) {
    this.prompt = prompt;
  }

  setResult(result) {
    this.result = result;
  }

  setProjectId(id) {
    this.projectId = id;
  }

  setProjectContext(context) {
    this.projectContext = context;
  }

  getProjectContext() {
    return this.projectContext;
  }

  addLogEntry(entry) {
    this.executionLog.push({
      timestamp: new Date().toISOString(),
      step: entry.step,
      provider: entry.provider,
      status: entry.status,
      duration: entry.duration || null,
      message: entry.message || ''
    });
  }

  toJSON() {
    return {
      id: this.id,
      task: this.task && typeof this.task.toJSON === 'function' ? this.task.toJSON() : this.task,
      domain: this.domain,
      language: this.language,
      userRequest: this.userRequest,
      plan: this.plan && typeof this.plan.toJSON === 'function' ? this.plan.toJSON() : this.plan,
      steps: this.steps,
      mcpResults: this.mcpResults,
      metadata: this.metadata,
      prompt: this.prompt,
      llmResponse: this.llmResponse,
      review: this.review && typeof this.review.toJSON === 'function' ? this.review.toJSON() : this.review,
      result: this.result && typeof this.result.toJSON === 'function' ? this.result.toJSON() : this.result,
      status: this.status,
      executionLog: this.executionLog,
      projectId: this.projectId,
      projectContext: this.projectContext
    };
  }

  static fromJSON(data) {
    const ctx = new ProgrammingContext();
    ctx.id = data.id || ctx.id;
    ctx.task = data.task || null;
    ctx.domain = data.domain || 'general';
    ctx.language = data.language || 'unknown';
    ctx.userRequest = data.userRequest || null;
    ctx.plan = data.plan || null;
    ctx.steps = data.steps || [];
    ctx.mcpResults = data.mcpResults || {};
    ctx.metadata = data.metadata || {};
    ctx.prompt = data.prompt || null;
    ctx.llmResponse = data.llmResponse || null;
    ctx.review = data.review || null;
    ctx.result = data.result || null;
    ctx.status = data.status || 'created';
    ctx.executionLog = data.executionLog || [];
    ctx.projectId = data.projectId || null;
    ctx.projectContext = data.projectContext || null;
    ctx.collectedData = data.collectedData || {};
    ctx.executionPlan = ctx.plan;
    ctx.stepResults = {};
    return ctx;
  }
}

module.exports = ProgrammingContext;