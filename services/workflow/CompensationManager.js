class CompensationManager {
  constructor(options = {}) {
    this._compensations = new Map();
    this._executed = [];
  }

  registerCompensation(nodeId, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Compensation handler for node "${nodeId}" must be a function`);
    }
    this._compensations.set(nodeId, handler);
  }

  async executeCompensation(nodeId, context) {
    const handler = this._compensations.get(nodeId);
    if (!handler) {
      return {
        nodeId,
        executed: false,
        reason: `No compensation registered for node "${nodeId}"`
      };
    }

    try {
      await handler(context);
      this._executed.push(nodeId);
      return {
        nodeId,
        executed: true
      };
    } catch (err) {
      return {
        nodeId,
        executed: false,
        reason: err.message || String(err)
      };
    }
  }

  async compensateFailed(failedNodeIds, context) {
    const results = [];
    for (const nodeId of failedNodeIds) {
      if (this._compensations.has(nodeId)) {
        const result = await this.executeCompensation(nodeId, context);
        results.push(result);
      }
    }
    return results;
  }

  async compensateAll(context) {
    if (this._failedNodeIds !== undefined && this._failedNodeIds.length === 0) {
      return [];
    }
    if (context && this._failedNodeIds && this._failedNodeIds.length > 0) {
      return this.compensateFailed(this._failedNodeIds, context);
    }
    const results = [];
    for (const [nodeId] of this._compensations) {
      const result = await this.executeCompensation(nodeId, context);
      results.push(result);
    }
    return results;
  }

  setFailedNodeIds(nodeIds) {
    this._failedNodeIds = nodeIds.slice();
  }

  hasCompensation(nodeId) {
    return this._compensations.has(nodeId);
  }

  removeCompensation(nodeId) {
    this._compensations.delete(nodeId);
  }

  clear() {
    this._compensations.clear();
    this._executed = [];
    this._failedNodeIds = [];
  }

  getExecuted() {
    return this._executed.slice();
  }

  count() {
    return this._compensations.size;
  }
}

module.exports = CompensationManager;