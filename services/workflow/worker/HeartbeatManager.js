const crypto = require('crypto');

class HeartbeatManager {
  constructor(options = {}) {
    this.storage = options.storage;
    this.workerId = options.workerId || `worker-${crypto.randomUUID().slice(0, 8)}`;
    this.defaultTtlMs = options.defaultTtlMs || 60000;
    this.intervalMs = options.intervalMs || Math.floor(this.defaultTtlMs / 2);
    this._timers = new Map();
    this._running = false;
  }

  start(workflowId) {
    if (this._timers.has(workflowId)) return;

    const timer = setInterval(async () => {
      try {
        await this.storage.heartbeat(workflowId, this.workerId, this.defaultTtlMs);
      } catch (err) {
        console.error(`[HeartbeatManager] heartbeat failed for ${workflowId}:`, err.message);
      }
    }, this.intervalMs);

    this._timers.set(workflowId, timer);
  }

  stop(workflowId) {
    const timer = this._timers.get(workflowId);
    if (timer) {
      clearInterval(timer);
      this._timers.delete(workflowId);
    }
  }

  stopAll() {
    for (const [workflowId] of this._timers) {
      this.stop(workflowId);
    }
  }

  async detectStuck(maxAgeMs) {
    const age = maxAgeMs || this.defaultTtlMs * 2;
    return this.storage.listStuckWorkflows(age);
  }

  isBeating(workflowId) {
    return this._timers.has(workflowId);
  }

  activeCount() {
    return this._timers.size;
  }
}

module.exports = HeartbeatManager;