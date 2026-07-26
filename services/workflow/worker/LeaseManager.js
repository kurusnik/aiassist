const crypto = require('crypto');

const LEASE_STATUS = {
  ACQUIRED: 'acquired',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  RELEASED: 'released'
};

class LeaseManager {
  constructor(options = {}) {
    this.storage = options.storage;
    this.workerId = options.workerId || `worker-${crypto.randomUUID().slice(0, 8)}`;
    this.defaultTtlMs = options.defaultTtlMs || 60000;
  }

  async acquire(workflowId, ttlMs) {
    const ttl = ttlMs || this.defaultTtlMs;
    const acquired = await this.storage.acquireLease(workflowId, this.workerId, ttl);
    return {
      status: acquired ? LEASE_STATUS.ACQUIRED : LEASE_STATUS.REJECTED,
      workflowId,
      workerId: this.workerId,
      ttlMs: ttl,
      acquiredAt: acquired ? Date.now() : null
    };
  }

  async release(workflowId) {
    await this.storage.releaseLease(workflowId, this.workerId);
    return {
      status: LEASE_STATUS.RELEASED,
      workflowId,
      workerId: this.workerId,
      releasedAt: Date.now()
    };
  }

  async renew(workflowId, ttlMs) {
    const ttl = ttlMs || this.defaultTtlMs;
    return this.storage.renewLease(workflowId, this.workerId, ttl);
  }

  async isOwned(workflowId) {
    const ctx = await this.storage.loadWorkflow(workflowId);
    if (!ctx) return false;
    return ctx.metadata && ctx.metadata.workerId === this.workerId;
  }

  async listStuck(maxAgeMs) {
    return this.storage.listStuckWorkflows(maxAgeMs || this.defaultTtlMs * 2);
  }
}

LeaseManager.LEASE_STATUS = LEASE_STATUS;

module.exports = LeaseManager;