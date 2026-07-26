const WorkflowStorage = require('./WorkflowStorage');

class InMemoryWorkflowStorage extends WorkflowStorage {
  constructor() {
    super();
    this._workflows = new Map();
    this._nodeStates = new Map();
    this._heartbeats = new Map();
    this._leases = new Map();
  }

  async saveWorkflow(context) {
    this._workflows.set(context.id, context);
  }

  async saveWorkflowNodeState(workflowId, nodeId, state) {
    const key = `${workflowId}:${nodeId}`;
    this._nodeStates.set(key, { ...state, updatedAt: Date.now() });
  }

  async loadWorkflow(workflowId) {
    return this._workflows.get(workflowId) || null;
  }

  async updateNodeState(workflowId, nodeId, state) {
    const key = `${workflowId}:${nodeId}`;
    this._nodeStates.set(key, { ...state, updatedAt: Date.now() });
  }

  async getNodeState(workflowId, nodeId) {
    return this._nodeStates.get(`${workflowId}:${nodeId}`) || null;
  }

  async listRunning() {
    return Array.from(this._workflows.values())
      .filter(ctx => {
        const s = ctx.status;
        return s === 'running' || s === 'waiting';
      });
  }

  async heartbeat(workflowId, workerId, ttlMs) {
    this._heartbeats.set(workflowId, {
      workerId,
      lastHeartbeat: Date.now(),
      expiresAt: Date.now() + ttlMs
    });
  }

  async acquireLease(workflowId, workerId, ttlMs) {
    const existing = this._leases.get(workflowId);
    if (existing && existing.workerId !== workerId && existing.expiresAt > Date.now()) {
      return false;
    }
    this._leases.set(workflowId, {
      workerId,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      leaseVersion: existing ? existing.leaseVersion + 1 : 1
    });
    return true;
  }

  async releaseLease(workflowId, workerId) {
    const existing = this._leases.get(workflowId);
    if (existing && existing.workerId === workerId) {
      this._leases.delete(workflowId);
    }
  }

  async renewLease(workflowId, workerId, ttlMs) {
    const existing = this._leases.get(workflowId);
    if (existing && existing.workerId === workerId) {
      existing.expiresAt = Date.now() + ttlMs;
      this._leases.set(workflowId, existing);
      return true;
    }
    return false;
  }

  async listStuckWorkflows(maxAgeMs) {
    const now = Date.now();
    return Array.from(this._heartbeats.entries())
      .filter(([_, hb]) => now - hb.lastHeartbeat > maxAgeMs)
      .map(([id]) => this._workflows.get(id))
      .filter(Boolean);
  }

  async removeWorkflow(workflowId) {
    this._workflows.delete(workflowId);
    for (const key of this._nodeStates.keys()) {
      if (key.startsWith(`${workflowId}:`)) {
        this._nodeStates.delete(key);
      }
    }
    this._heartbeats.delete(workflowId);
    this._leases.delete(workflowId);
  }

  async count() {
    return this._workflows.size;
  }

  async clear() {
    this._workflows.clear();
    this._nodeStates.clear();
    this._heartbeats.clear();
    this._leases.clear();
  }
}

module.exports = InMemoryWorkflowStorage;