const crypto = require('crypto');
const WorkflowExecutor = require('../WorkflowExecutor');
const WorkflowContext = require('../WorkflowContext');
const InMemoryWorkflowStorage = require('../storage/InMemoryWorkflowStorage');
const InMemoryWorkflowQueue = require('./WorkflowQueue').InMemoryWorkflowQueue;
const LeaseManager = require('./LeaseManager');
const HeartbeatManager = require('./HeartbeatManager');

const STATUS = {
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  STOPPED: 'stopped'
};

class WorkerRuntime {
  constructor(options = {}) {
    this.workerId = options.workerId || `worker-${crypto.randomUUID().slice(0, 8)}`;
    this.executor = options.executor || new WorkflowExecutor();
    this.storage = options.storage || this.executor.storage || new InMemoryWorkflowStorage();
    this.queue = options.queue || new InMemoryWorkflowQueue();
    this.pollIntervalMs = options.pollIntervalMs || 5000;
    this.leaseTtlMs = options.leaseTtlMs || 60000;
    this.auditService = options.auditService || null;
    this._status = STATUS.STOPPED;
    this._pollTimer = null;
    this._stuckTimer = null;
    this._stuckCheckIntervalMs = options.stuckCheckIntervalMs || 30000;
    this.maxConcurrent = options.maxConcurrent || 10;
    this.pollBatchSize = options.pollBatchSize || 50;
    this._semaphore = 0;
    this._backoffMs = options.backoffMs || 1000;
    this._backoffMultiplier = options.backoffMultiplier || 2;
    this._maxBackoffMs = options.maxBackoffMs || 60000;
    this._consecutiveErrors = 0;
    this._currentBackoff = 0;

    this.leaseManager = new LeaseManager({
      storage: this.storage,
      workerId: this.workerId,
      defaultTtlMs: this.leaseTtlMs
    });

    this.heartbeatManager = new HeartbeatManager({
      storage: this.storage,
      workerId: this.workerId,
      defaultTtlMs: this.leaseTtlMs
    });
  }

  get status() {
    return this._status;
  }

  isRunning() {
    return this._status === STATUS.RUNNING;
  }

  async start() {
    if (this._status === STATUS.RUNNING) return;
    this._status = STATUS.STARTING;

    await this._registerWorker();

    this._status = STATUS.RUNNING;

    this._pollTimer = setInterval(() => {
      this._poll().catch(err => {
        console.error(`[Worker ${this.workerId}] poll error:`, err.message);
      });
    }, this.pollIntervalMs);

    this._stuckTimer = setInterval(() => {
      this._checkStuck().catch(err => {
        console.error(`[Worker ${this.workerId}] stuck check error:`, err.message);
      });
    }, this._stuckCheckIntervalMs);

    if (this.auditService) {
      try {
        await this.auditService.store.append({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          actor: 'worker_runtime',
          action: 'worker_started',
          resource: `worker:${this.workerId}`,
          workflowId: null,
          nodeId: null,
          decision: 'started',
          metadata: { workerId: this.workerId, pollIntervalMs: this.pollIntervalMs, leaseTtlMs: this.leaseTtlMs }
        });
      } catch (_) {
      }
    }

    return { workerId: this.workerId, status: STATUS.RUNNING };
  }

  async stop() {
    if (this._status !== STATUS.RUNNING) return;
    this._status = STATUS.STOPPING;

    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }

    if (this._stuckTimer) {
      clearInterval(this._stuckTimer);
      this._stuckTimer = null;
    }

    this.heartbeatManager.stopAll();

    if (this.auditService) {
      try {
        await this.auditService.store.append({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          actor: 'worker_runtime',
          action: 'worker_stopped',
          resource: `worker:${this.workerId}`,
          workflowId: null,
          nodeId: null,
          decision: 'stopped',
          metadata: { workerId: this.workerId }
        });
      } catch (_) {
      }
    }

    this._status = STATUS.STOPPED;
    return { workerId: this.workerId, status: STATUS.STOPPED };
  }

  async submit(workflowDefinition, input = {}) {
    const result = await this.executor.execute(workflowDefinition, input);
    if (result.success && result.context && result.context.id) {
      await this.queue.enqueue(result.context.id);
    }
    return result;
  }

  async submitExisting(workflowId) {
    await this.queue.enqueue(workflowId);
  }

  async _registerWorker() {
    this.executor.workerId = this.workerId;
  }

  async _poll() {
    if (this._status !== STATUS.RUNNING) return;

    if (this._currentBackoff > 0) {
      await new Promise(r => setTimeout(r, this._currentBackoff));
    }

    let workflows;
    try {
      workflows = await this.storage.listRunning();
      this._consecutiveErrors = 0;
      this._currentBackoff = 0;
    } catch (err) {
      this._consecutiveErrors++;
      this._currentBackoff = Math.min(
        this._backoffMs * Math.pow(this._backoffMultiplier, this._consecutiveErrors - 1),
        this._maxBackoffMs
      );
      console.error(`[Worker ${this.workerId}] listRunning failed (attempt ${this._consecutiveErrors}), backoff ${this._currentBackoff}ms:`, err.message);
      return;
    }

    const batch = workflows.slice(0, this.pollBatchSize);

    for (const ctx of batch) {
      if (this._status !== STATUS.RUNNING) break;

      if (this._semaphore >= this.maxConcurrent) {
        break;
      }

      const leaseResult = await this.leaseManager.acquire(ctx.id, this.leaseTtlMs);
      if (leaseResult.status !== 'acquired') continue;

      this._semaphore++;

      this._executeWithSemaphore(ctx.id).finally(() => {
        this._semaphore--;
      });
    }
  }

  async _executeWithSemaphore(workflowId) {
    const leaseResult = await this.leaseManager.acquire(workflowId, this.leaseTtlMs);
    if (leaseResult.status !== 'acquired') return;

    try {
      this.heartbeatManager.start(workflowId);

      const resumeResult = await this.executor.resume(workflowId);

      if (this.auditService) {
        try {
          await this.auditService.store.append({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            actor: 'worker_runtime',
            action: 'workflow_processed',
            resource: `workflow:${workflowId}`,
            workflowId,
            nodeId: null,
            decision: resumeResult.success ? 'completed' : 'failed',
            metadata: { workerId: this.workerId, success: resumeResult.success }
          });
        } catch (_) {
        }
      }
    } catch (err) {
      if (this.auditService) {
        try {
          await this.auditService.store.append({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            actor: 'worker_runtime',
            action: 'workflow_execution_error',
            resource: `workflow:${workflowId}`,
            workflowId,
            nodeId: null,
            decision: 'error',
            metadata: { workerId: this.workerId, error: err.message }
          });
        } catch (_) {
        }
      }
    } finally {
      this.heartbeatManager.stop(workflowId);
      await this.leaseManager.release(workflowId);
    }
  }

  async _checkStuck() {
    if (this._status !== STATUS.RUNNING) return;

    let stuck;
    try {
      stuck = await this.heartbeatManager.detectStuck(this.leaseTtlMs * 2);
    } catch (err) {
      return;
    }

    for (const ctx of stuck) {
      if (!ctx || ctx.status === WorkflowContext.STATUS.COMPLETED) continue;

      const leaseResult = await this.leaseManager.acquire(ctx.id, this.leaseTtlMs);
      if (leaseResult.status !== 'acquired') continue;

      try {
        ctx.transitionTo(WorkflowContext.STATUS.FAILED);
        ctx.incrementVersion();
        await this.storage.saveWorkflow(ctx);

        if (this.auditService) {
          try {
            await this.auditService.store.append({
              id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
              actor: 'worker_runtime',
              action: 'stuck_workflow_failed',
              resource: `workflow:${ctx.id}`,
              workflowId: ctx.id,
              nodeId: null,
              decision: 'failed',
              metadata: { workerId: this.workerId, reason: 'heartbeat_expired' }
            });
          } catch (_) {
          }
        }
      } finally {
        await this.leaseManager.release(ctx.id);
      }
    }
  }
}

WorkerRuntime.STATUS = STATUS;

module.exports = WorkerRuntime;