const planId = (() => {
  let counter = 0;
  return () => `plan_${++counter}`;
})();

class ExecutionPlan {
  constructor(taskId, steps, estimatedComplexity) {
    this.id = planId();
    this.taskId = taskId;
    this.steps = steps;
    this.estimatedComplexity = estimatedComplexity;
  }
}

module.exports = ExecutionPlan;