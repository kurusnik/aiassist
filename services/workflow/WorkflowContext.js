const crypto = require('crypto');

const STATUS = {
  CREATED: 'created',
  RUNNING: 'running',
  WAITING: 'waiting',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

const VALID_TRANSITIONS = {
  [STATUS.CREATED]: [STATUS.RUNNING, STATUS.CANCELLED, STATUS.FAILED, STATUS.COMPLETED],
  [STATUS.RUNNING]: [STATUS.COMPLETED, STATUS.FAILED, STATUS.PAUSED, STATUS.WAITING, STATUS.CANCELLED],
  [STATUS.WAITING]: [STATUS.RUNNING, STATUS.CANCELLED, STATUS.FAILED],
  [STATUS.PAUSED]: [STATUS.RUNNING, STATUS.CANCELLED],
  [STATUS.COMPLETED]: [],
  [STATUS.FAILED]: [STATUS.RUNNING],
  [STATUS.CANCELLED]: [STATUS.RUNNING]
};

class WorkflowContext {
  constructor(options = {}) {
    this.id = options.id || crypto.randomUUID();
    this.traceId = options.traceId || crypto.randomUUID();
    this.status = options.status || STATUS.CREATED;
    this.input = options.input || null;
    this.nodes = options.nodes || {};
    this.variables = options.variables || {};
    this.metadata = options.metadata || {};
    this.createdAt = options.createdAt || Date.now();
    this.updatedAt = options.updatedAt || Date.now();
    this._version = options._version || 1;
  }

  clone() {
    return new WorkflowContext({
      id: this.id,
      traceId: crypto.randomUUID(),
      status: this.status,
      input: this.input,
      nodes: { ...this.nodes },
      variables: { ...this.variables },
      metadata: { ...this.metadata },
      createdAt: this.createdAt,
      updatedAt: Date.now(),
      _version: this._version
    });
  }

  fork(overrides = {}) {
    return new WorkflowContext({
      id: overrides.id || crypto.randomUUID(),
      traceId: overrides.traceId || crypto.randomUUID(),
      status: STATUS.CREATED,
      input: overrides.input || this.input,
      nodes: overrides.nodes || {},
      variables: { ...this.variables, ...overrides.variables },
      metadata: { ...this.metadata, ...overrides.metadata },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      _version: this._version
    });
  }

  setVariable(key, value) {
    this.variables[key] = value;
    this.updatedAt = Date.now();
  }

  getVariable(key) {
    return this.variables[key];
  }

  incrementVersion() {
    this._version++;
    this.updatedAt = Date.now();
  }

  canTransitionTo(newStatus) {
    const allowed = VALID_TRANSITIONS[this.status];
    if (!allowed) return false;
    return allowed.includes(newStatus);
  }

  transitionTo(newStatus) {
    if (!this.canTransitionTo(newStatus)) {
      throw new Error(
        `Invalid status transition: "${this.status}" -> "${newStatus}". ` +
        `Allowed: ${(VALID_TRANSITIONS[this.status] || []).join(', ') || 'none'}`
      );
    }
    this.status = newStatus;
    this.updatedAt = Date.now();
  }

  toJSON() {
    const serialized = {
      id: this.id,
      traceId: this.traceId,
      status: this.status,
      input: this.input,
      nodes: this.nodes,
      variables: this.variables,
      metadata: this.metadata,
      createdAt: new Date(this.createdAt).toISOString(),
      updatedAt: new Date(this.updatedAt).toISOString(),
      _version: this._version
    };

    if (this.metadata && this.metadata.workflowDefinition) {
      serialized.metadata = { ...this.metadata };
      serialized.metadata.workflowDefinition = this.metadata.workflowDefinition.toJSON();
    }

    return serialized;
  }

  static fromJSON(json) {
    return new WorkflowContext({
      id: json.id,
      traceId: json.traceId,
      status: json.status,
      input: json.input,
      nodes: json.nodes || {},
      variables: json.variables || {},
      metadata: json.metadata || {},
      createdAt: new Date(json.createdAt).getTime(),
      updatedAt: new Date(json.updatedAt).getTime(),
      _version: json._version || 1
    });
  }
}

WorkflowContext.STATUS = STATUS;
WorkflowContext.VALID_TRANSITIONS = VALID_TRANSITIONS;

module.exports = WorkflowContext;