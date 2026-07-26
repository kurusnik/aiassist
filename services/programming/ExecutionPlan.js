const crypto = require('crypto');

class ExecutionPlan {
  constructor(taskId, steps, estimatedComplexity) {
    this.id = crypto.randomUUID();
    this.taskId = taskId;
    this.steps = steps;
    this.estimatedComplexity = estimatedComplexity;
  }

  toJSON() {
    return {
      id: this.id,
      taskId: this.taskId,
      steps: this.steps.map(s => ({ ...s })),
      estimatedComplexity: this.estimatedComplexity
    };
  }
}

module.exports = ExecutionPlan;