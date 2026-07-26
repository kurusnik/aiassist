const { ExecutionGraph } = require('./ExecutionGraph');

class WorkflowDefinition {
  constructor(options = {}) {
    this.id = options.id || null;
    this.name = options.name || 'unnamed_workflow';
    this.version = options.version || '1.0';
    this.graph = options.graph || null;
    this.metadata = options.metadata || {};
  }

  validate() {
    const errors = [];

    if (!this.id) {
      errors.push('Workflow id is required');
    }

    if (!this.name) {
      errors.push('Workflow name is required');
    }

    if (!this.graph) {
      errors.push('Workflow graph is required');
    } else if (this.graph instanceof ExecutionGraph) {
      const graphValidation = this.graph.validate();
      if (!graphValidation.valid) {
        errors.push(...graphValidation.errors);
      }
    } else {
      errors.push('Workflow graph must be an instance of ExecutionGraph');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      graph: this.graph ? this.graph.toJSON() : null,
      metadata: this.metadata
    };
  }
}

module.exports = WorkflowDefinition;