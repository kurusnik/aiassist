class PlanningContext {
  constructor(queryPlan, taskContext) {
    this.id = null;
    this.createdAt = Date.now();
    this.queryPlan = queryPlan || null;
    this.taskContext = taskContext || null;
    this.executionIntent = null;
    this.actions = [];
    this.confidence = null;
    this.safety = {
      requiresConfirmation: false,
      requiresPermission: false,
      auditLevel: 'none'
    };
    this.metadata = {};
  }

  toJSON() {
    return {
      id: this.id,
      createdAt: new Date(this.createdAt).toISOString(),
      queryPlan: this.queryPlan ? this.queryPlan.toJSON() : null,
      taskContext: this.taskContext,
      executionIntent: this.executionIntent,
      actions: this.actions,
      confidence: this.confidence,
      safety: this.safety,
      metadata: this.metadata
    };
  }
}

module.exports = PlanningContext;