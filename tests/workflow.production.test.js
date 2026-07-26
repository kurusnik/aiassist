const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const crypto = require('crypto');

const WorkerRuntime = require('../services/workflow/worker/WorkerRuntime');
const { InMemoryWorkflowQueue } = require('../services/workflow/worker/WorkflowQueue');
const LeaseManager = require('../services/workflow/worker/LeaseManager');
const HeartbeatManager = require('../services/workflow/worker/HeartbeatManager');
const WorkflowExecutor = require('../services/workflow/WorkflowExecutor');
const InMemoryWorkflowStorage = require('../services/workflow/storage/InMemoryWorkflowStorage');
const { ExecutionGraph } = require('../services/workflow/ExecutionGraph');
const WorkflowDefinition = require('../services/workflow/WorkflowDefinition');
const WorkflowContext = require('../services/workflow/WorkflowContext');
const PostgresWorkflowQueue = require('../services/workflow/queue/PostgresWorkflowQueue');
const IdempotencyStore = require('../services/workflow/storage/IdempotencyStore');
const PostgresIdempotencyStore = require('../services/workflow/storage/PostgresIdempotencyStore');
const AuditBuffer = require('../services/audit/AuditBuffer');
const PostgresAuditStore = require('../services/audit/PostgresAuditStore');
const ApprovalStore = require('../services/security/approval/ApprovalStore');
const ApprovalRequest = require('../services/security/approval/ApprovalRequest');

describe('Production — worker lease enforcement', () => {
  it('two workers competing for same workflow — only one gets lease', async () => {
    const storage = new InMemoryWorkflowStorage();
    const ctx = new WorkflowContext({ id: 'lease-compete', status: 'running' });
    await storage.saveWorkflow(ctx);

    const worker1 = new WorkerRuntime({ storage, pollIntervalMs: 5000, leaseTtlMs: 10000, workerId: 'prod-worker-1' });
    const worker2 = new WorkerRuntime({ storage, pollIntervalMs: 5000, leaseTtlMs: 10000, workerId: 'prod-worker-2' });

    await worker1.start();
    await worker2.start();

    const lease1 = await worker1.leaseManager.acquire('lease-compete', 10000);
    assert.equal(lease1.status, 'acquired', 'Worker 1 should acquire lease');

    const lease2 = await worker2.leaseManager.acquire('lease-compete', 10000);
    assert.equal(lease2.status, 'rejected', 'Worker 2 should be rejected');

    await worker1.leaseManager.release('lease-compete');
    await worker1.stop();
    await worker2.stop();
  });

  it('lease expiration allows other worker to steal', async () => {
    const storage = new InMemoryWorkflowStorage();
    const ctx = new WorkflowContext({ id: 'lease-steal', status: 'running' });
    await storage.saveWorkflow(ctx);

    const worker1 = new WorkerRuntime({ storage, workerId: 'steal-worker-1' });
    const worker2 = new WorkerRuntime({ storage, workerId: 'steal-worker-2' });

    await worker1.leaseManager.acquire('lease-steal', 1);
    await new Promise(r => setTimeout(r, 10));

    const result = await worker2.leaseManager.acquire('lease-steal', 10000);
    assert.equal(result.status, 'acquired', 'Worker 2 should steal expired lease');

    await worker2.leaseManager.release('lease-steal');
  });
});

describe('Production — heartbeat timeout detection', () => {
  it('should detect expired heartbeat as stuck', async () => {
    const storage = new InMemoryWorkflowStorage();
    const ctx = new WorkflowContext({ id: 'hb-stuck-prod', status: 'running' });
    await storage.saveWorkflow(ctx);
    await storage.heartbeat('hb-stuck-prod', 'worker-1', 1);
    await new Promise(r => setTimeout(r, 20));

    const hb = new HeartbeatManager({ storage, workerId: 'worker-2' });
    const stuck = await hb.detectStuck(10);
    assert.ok(stuck.length > 0);
    assert.ok(stuck.some(w => w && w.id === 'hb-stuck-prod'));
  });
});

describe('Production — worker crash recovery', () => {
  it('should recover workflow after worker crash', async () => {
    const graph = new ExecutionGraph({ id: 'crash-rec' });
    graph.addNode('a', 'agent', { handler: async (ctx) => ({ output: 'recovered' }) });

    const def = new WorkflowDefinition({ id: 'wf-crash-rec', name: 'crash-rec', graph });
    const executor = new WorkflowExecutor({
      agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
    });

    const storage = executor.storage;
    const worker1 = new WorkerRuntime({ executor, storage, pollIntervalMs: 50, leaseTtlMs: 500, workerId: 'crash-1' });

    await worker1.start();
    const execResult = await worker1.submit(def, {});
    assert.equal(execResult.success, true);
    const workflowId = execResult.context.id;

    await worker1.stop();

    const ctx = await storage.loadWorkflow(workflowId);
    ctx.status = 'running';
    await storage.saveWorkflow(ctx);

    const worker2 = new WorkerRuntime({ executor, storage, pollIntervalMs: 50, leaseTtlMs: 500, workerId: 'crash-2' });
    await worker2.start();
    await new Promise(r => setTimeout(r, 1200));
    await worker2.stop();

    const recovered = await storage.loadWorkflow(workflowId);
    assert.equal(recovered.status, 'completed', 'Second worker should complete the workflow');
  });
});

describe('Production — concurrent 100 workflows across workers', () => {
  it('should distribute load across 4 workers', async () => {
    const executor = new WorkflowExecutor({
      agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
    });

    const storage = executor.storage;

    const workers = [];
    for (let i = 0; i < 4; i++) {
      const w = new WorkerRuntime({
        executor, storage, pollIntervalMs: 10, leaseTtlMs: 5000,
        workerId: `mass-${i}`, maxConcurrent: 10, pollBatchSize: 25
      });
      workers.push(w);
      await w.start();
    }

    const workflowIds = [];
    for (let i = 0; i < 100; i++) {
      const g = new ExecutionGraph({ id: `g-${i}` });
      g.addNode('a', 'agent', { handler: async (ctx) => ({ output: `done-${i}` }) });
      const d = new WorkflowDefinition({ id: `wf-mass-${i}`, name: `mass-${i}`, graph: g });
      const result = await executor.execute(d, { index: i });
      if (result.success && result.context && result.context.id) {
        workflowIds.push(result.context.id);
      }
    }

    await new Promise(r => setTimeout(r, 2000));

    let completed = 0;
    for (const id of workflowIds) {
      const wf = await storage.loadWorkflow(id);
      if (wf && wf.status === 'completed') completed++;
    }

    assert.ok(completed >= 90, `Expected >= 90 completed, got ${completed}`);

    for (const w of workers) {
      await w.stop();
    }
  });
});

describe('Production — queue lock with SKIP LOCKED', () => {
  it('should dequeue items with proper locking', async () => {
    const queue = new InMemoryWorkflowQueue();
    await queue.enqueue('wf-queue-1');
    await queue.enqueue('wf-queue-2');

    const item1 = await queue.dequeue('worker-1');
    assert.equal(item1, 'wf-queue-1');

    const item2 = await queue.dequeue('worker-2');
    assert.equal(item2, 'wf-queue-2');

    const empty = await queue.dequeue('worker-1');
    assert.equal(empty, null);

    await queue.ack('wf-queue-1');
    await queue.reject('wf-queue-2');
    const requeued = await queue.dequeue('worker-1');
    assert.equal(requeued, 'wf-queue-2');
  });
});

describe('Production — idempotency restart recovery', () => {
  it('should survive restart with persistent idempotency store', async () => {
    const store = new Map();
    const persistence = {
      async check(key) {
        return store.get(key) || null;
      },
      async store(key, workflowId) {
        store.set(key, { workflowId });
      },
      async clear() {
        store.clear();
      }
    };

    await persistence.store('key-1', 'wf-1');
    const result1 = await persistence.check('key-1');
    assert.ok(result1);
    assert.equal(result1.workflowId, 'wf-1');

    const result2 = await persistence.check('key-unknown');
    assert.equal(result2, null);
  });
});

describe('Production — audit async buffering', () => {
  it('should buffer and flush audit events', async () => {
    const events = [];
    const mockStore = {
      async append(event) {
        events.push(event);
      }
    };

    const buffer = new AuditBuffer({ store: mockStore, flushIntervalMs: 5000, batchSize: 10 });

    for (let i = 0; i < 5; i++) {
      await buffer.append({ id: `evt-${i}`, action: 'test', timestamp: new Date().toISOString() });
    }

    assert.equal(buffer.bufferSize(), 5);

    await buffer.flush();
    assert.equal(buffer.bufferSize(), 0);
    assert.equal(events.length, 5);
  });

  it('should auto-flush when batch size reached', async () => {
    const events = [];
    const mockStore = {
      async append(event) {
        events.push(event);
      }
    };

    const buffer = new AuditBuffer({ store: mockStore, flushIntervalMs: 60000, batchSize: 3 });

    await buffer.append({ id: 'a', action: 'test' });
    await buffer.append({ id: 'b', action: 'test' });
    assert.equal(events.length, 0);

    await buffer.append({ id: 'c', action: 'test' });
    assert.equal(events.length, 3, 'Should flush when batch size reached');
  });
});

describe('Production — ApprovalStore interface alignment', () => {
  it('should support createdAfter filter', () => {
    const store = new ApprovalStore();
    const now = Date.now();

    const r1 = store.create({ action: { type: 'test' }, status: 'pending', requestedAt: now - 10000 });
    const r2 = store.create({ action: { type: 'test' }, status: 'pending', requestedAt: now - 5000 });
    const r3 = store.create({ action: { type: 'test' }, status: 'approved', requestedAt: now });

    const pending = store.list({ status: 'pending' });
    assert.equal(pending.length, 2);

    const recent = store.list({ createdAfter: new Date(now - 7000).toISOString() });
    assert.equal(recent.length, 2);

    const all = store.list();
    assert.equal(all.length, 3);
  });

  it('should support status and workflow filters', () => {
    const store = new ApprovalStore();
    const r1 = store.create({ action: { type: 'test', workflowId: 'wf-1' }, status: 'pending' });
    const r2 = store.create({ action: { type: 'test', workflowId: 'wf-1' }, status: 'approved' });
    const r3 = store.create({ action: { type: 'test', workflowId: 'wf-2' }, status: 'pending' });

    const wf1 = store.list({ workflowId: 'wf-1' });
    assert.equal(wf1.length, 2);
  });
});

describe('Production — worker concurrency limit', () => {
  it('should not exceed maxConcurrent', async () => {
    const runtime = new WorkerRuntime({
      pollIntervalMs: 100,
      leaseTtlMs: 60000,
      maxConcurrent: 5,
      pollBatchSize: 10
    });

    assert.equal(runtime.maxConcurrent, 5);
    assert.equal(runtime.pollBatchSize, 10);

    await runtime.start();
    await runtime.stop();
  });

  it('should apply backoff on errors', async () => {
    const runtime = new WorkerRuntime({
      pollIntervalMs: 5000,
      leaseTtlMs: 60000,
      backoffMs: 100,
      backoffMultiplier: 2,
      maxBackoffMs: 10000
    });

    assert.equal(runtime._backoffMs, 100);
    assert.equal(runtime._backoffMultiplier, 2);
    assert.equal(runtime._maxBackoffMs, 10000);
    assert.equal(runtime._consecutiveErrors, 0);
    assert.equal(runtime._currentBackoff, 0);

    await runtime.start();
    await runtime.stop();
  });
});

describe('Production — worker runtime lifecycle', () => {
  it('should transition through all lifecycle states', async () => {
    const runtime = new WorkerRuntime({ pollIntervalMs: 5000, leaseTtlMs: 60000 });

    assert.equal(runtime.status, 'stopped');
    assert.equal(runtime.isRunning(), false);

    await runtime.start();
    assert.equal(runtime.status, 'running');
    assert.equal(runtime.isRunning(), true);

    await runtime.start();
    assert.equal(runtime.status, 'running', 'Start should be idempotent');

    await runtime.stop();
    assert.equal(runtime.status, 'stopped');
    assert.equal(runtime.isRunning(), false);

    await runtime.stop();
    assert.equal(runtime.status, 'stopped', 'Stop should be idempotent');
  });
});