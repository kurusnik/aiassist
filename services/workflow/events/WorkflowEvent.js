const crypto = require('crypto');

const EVENT_TYPES = {
  WORKFLOW_STARTED: 'workflow_started',
  WORKFLOW_COMPLETED: 'workflow_completed',
  WORKFLOW_FAILED: 'workflow_failed',
  NODE_STARTED: 'node_started',
  NODE_COMPLETED: 'node_completed',
  NODE_FAILED: 'node_failed',
  RETRY_STARTED: 'retry_started',
  COMPENSATION_STARTED: 'compensation_started'
};

class WorkflowEvent {
  constructor(options = {}) {
    this.id = options.id || crypto.randomUUID();
    this.workflowId = options.workflowId || null;
    this.nodeId = options.nodeId || null;
    this.type = options.type || null;
    this.timestamp = options.timestamp || Date.now();
    this.payload = options.payload || {};
  }

  toJSON() {
    return {
      id: this.id,
      workflowId: this.workflowId,
      nodeId: this.nodeId,
      type: this.type,
      timestamp: new Date(this.timestamp).toISOString(),
      payload: this.payload
    };
  }
}

WorkflowEvent.EVENT_TYPES = EVENT_TYPES;

module.exports = WorkflowEvent;