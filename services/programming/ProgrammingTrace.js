class ProgrammingTrace {
  constructor() {
    this.task = null;
    this.confidence = 0;
    this.steps = [];
    this.mcpCalls = [];
    this.duration = 0;
    this.status = 'pending';
  }

  start() {
    this._startTime = Date.now();
    this.status = 'running';
  }

  finish() {
    this.duration = Date.now() - (this._startTime || Date.now());
    this.status = this.status === 'error' ? 'error' : 'completed';
  }

  fail() {
    this.status = 'error';
    this.duration = Date.now() - (this._startTime || Date.now());
  }

  addStep(stepEntry) {
    this.steps.push({
      order: stepEntry.order,
      action: stepEntry.action,
      provider: stepEntry.provider,
      status: stepEntry.status || 'pending',
      duration: stepEntry.duration || null
    });
  }

  addMcpCall(call) {
    this.mcpCalls.push({
      tool: call.tool,
      action: call.action,
      status: call.status || 'unknown',
      duration: call.duration || null
    });
  }

  setTask(task, confidence) {
    this.task = task;
    this.confidence = confidence;
  }

  toJSON() {
    return {
      task: this.task ? { type: this.task.type, title: this.task.title, language: this.task.language, domain: this.task.domain } : null,
      confidence: this.confidence,
      steps: this.steps,
      mcpCalls: this.mcpCalls,
      duration: this.duration,
      status: this.status
    };
  }

  static fromJSON(data) {
    const trace = new ProgrammingTrace();
    trace.task = data.task || null;
    trace.confidence = data.confidence || 0;
    trace.steps = data.steps || [];
    trace.mcpCalls = data.mcpCalls || [];
    trace.duration = data.duration || 0;
    trace.status = data.status || 'pending';
    return trace;
  }
}

module.exports = ProgrammingTrace;