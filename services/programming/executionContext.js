const ctxId = (() => {
  let counter = 0;
  return () => `ctx_${++counter}`;
})();

class ExecutionContext {
  constructor() {
    this.id = ctxId();
    this.task = null;
    this.executionPlan = null;
    this.collectedData = {};
    this.prompt = null;
    this.result = null;
    this.metadata = {};
    this.executionLog = [];
    this.projectId = null;
    this.projectContext = null;
  }

  setTask(task) {
    this.task = task;
  }

  setPlan(plan) {
    this.executionPlan = plan;
  }

  addData(source, data) {
    this.collectedData[source] = data;
  }

  getData(source) {
    return this.collectedData[source] || null;
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
      executionPlan: this.executionPlan && typeof this.executionPlan.toJSON === 'function' ? this.executionPlan.toJSON() : this.executionPlan,
      collectedData: this.collectedData,
      prompt: this.prompt,
      result: this.result && typeof this.result.toJSON === 'function' ? this.result.toJSON() : this.result,
      metadata: this.metadata,
      executionLog: this.executionLog,
      projectId: this.projectId,
      projectContext: this.projectContext
    };
  }

  static fromJSON(data) {
    const ctx = new ExecutionContext();
    ctx.id = data.id || ctx.id;
    ctx.task = data.task || null;
    ctx.executionPlan = data.executionPlan || null;
    ctx.collectedData = data.collectedData || {};
    ctx.prompt = data.prompt || null;
    ctx.result = data.result || null;
    ctx.metadata = data.metadata || {};
    ctx.executionLog = data.executionLog || [];
    ctx.projectId = data.projectId || null;
    ctx.projectContext = data.projectContext || null;
    return ctx;
  }
}

module.exports = ExecutionContext;