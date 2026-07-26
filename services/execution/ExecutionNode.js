const STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  ERROR: 'error',
  SKIPPED: 'skipped'
};

class ExecutionNode {
  constructor(id, type, options = {}) {
    this.id = id;
    this.type = type;
    this.startedAt = options.startedAt || null;
    this.finishedAt = options.finishedAt || null;
    this.duration = options.duration || null;
    this.status = options.status || STATUS.PENDING;
    this.metadata = options.metadata || {};
    this.subgraph = options.subgraph || null;
  }

  start() {
    this.startedAt = Date.now();
    this.status = STATUS.RUNNING;
  }

  finish(metadata = {}) {
    this.finishedAt = Date.now();
    this.duration = this.finishedAt - (this.startedAt || this.finishedAt);
    this.status = metadata.error ? STATUS.ERROR : STATUS.SUCCESS;
    this.metadata = { ...this.metadata, ...metadata };
  }

  skip(reason) {
    this.status = STATUS.SKIPPED;
    this.metadata.skipReason = reason;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      startedAt: this.startedAt ? new Date(this.startedAt).toISOString() : null,
      finishedAt: this.finishedAt ? new Date(this.finishedAt).toISOString() : null,
      duration: this.duration,
      status: this.status,
      metadata: this.metadata,
      subgraph: this.subgraph ? this.subgraph.toJSON() : null
    };
  }
}

ExecutionNode.STATUS = STATUS;

module.exports = ExecutionNode;