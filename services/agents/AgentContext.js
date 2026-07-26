const crypto = require('crypto');

class AgentContext {
  constructor(options = {}) {
    this.traceId = options.traceId || crypto.randomUUID();
    this.queryContext = options.queryContext || null;
    this.planningContext = options.planningContext || null;
    this.candidates = options.candidates ? [...options.candidates] : [];
    this.metadata = { ...options.metadata };
    this._internal = {};
  }

  clone() {
    const cloned = new AgentContext({
      traceId: this.traceId,
      queryContext: this.queryContext,
      planningContext: this.planningContext,
      candidates: this.candidates,
      metadata: this.metadata
    });
    cloned._internal = { ...this._internal };
    return cloned;
  }

  fork(overrides = {}) {
    const forked = new AgentContext({
      queryContext: this.queryContext,
      planningContext: overrides.planningContext || this.planningContext,
      candidates: overrides.candidates || this.candidates,
      metadata: { ...this.metadata, ...overrides.metadata }
    });
    forked._internal = { ...this._internal, ...overrides._internal };
    return forked;
  }

  toJSON() {
    return {
      traceId: this.traceId,
      queryContext: this.queryContext && typeof this.queryContext.toJSON === 'function'
        ? this.queryContext.toJSON() : this.queryContext,
      planningContext: this.planningContext && typeof this.planningContext.toJSON === 'function'
        ? this.planningContext.toJSON() : this.planningContext,
      candidatesCount: this.candidates.length,
      metadata: this.metadata
    };
  }
}

module.exports = AgentContext;