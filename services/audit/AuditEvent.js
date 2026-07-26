const crypto = require('crypto');

class AuditEvent {
  constructor(options = {}) {
    this.id = options.id || crypto.randomUUID();
    this.timestamp = options.timestamp || Date.now();
    this.actor = options.actor || null;
    this.action = options.action || null;
    this.resource = options.resource || null;
    this.workflowId = options.workflowId || null;
    this.nodeId = options.nodeId || null;
    this.decision = options.decision || null;
    this.metadata = options.metadata || {};
  }

  toJSON() {
    return {
      id: this.id,
      timestamp: new Date(this.timestamp).toISOString(),
      actor: this.actor,
      action: this.action,
      resource: this.resource,
      workflowId: this.workflowId,
      nodeId: this.nodeId,
      decision: this.decision,
      metadata: this.metadata
    };
  }

  static fromJSON(json) {
    return new AuditEvent({
      id: json.id,
      timestamp: new Date(json.timestamp).getTime(),
      actor: json.actor,
      action: json.action,
      resource: json.resource,
      workflowId: json.workflowId,
      nodeId: json.nodeId,
      decision: json.decision,
      metadata: json.metadata || {}
    });
  }
}

module.exports = AuditEvent;