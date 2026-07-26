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

describe('WorkflowQueue — InMemory implementation', () => {
  it('should enqueue and dequeue workflow IDs', async () => {
    const queue = new InMemoryWorkflowQueue();
    await queue.enqueue('wf-1');
    await queue.enqueue('wf-2');
    assert.equal(await queue.count(), 2);

    const wf1 = await queue.dequeue('worker-1');
    assert.equal(wf1, 'wf-1');
    assert.equal(await queue.count(), 1);

    const wf2 = await queue.dequeue('worker-1');
    assert.equal(wf2, 'wf-2');
    assert.equal(await queue.count(), 0);
  });

  it('should return null when queue is empty', async () => {
    const queue = new InMemoryWorkflowQueue();
    const result = await queue.dequeue('worker-1');
    assert.equal(result, null);
  });

  it('should reject and re-enqueue', async () => {
    const queue = new InMemoryWorkflowQueue();
    await queue.enqueue('wf-1');
    const wf = await queue.dequeue('worker-1');
    assert.equal(wf, 'wf-1');
    assert.equal(await queue.count(), 0);

    await queue.reject('wf-1');
    assert.equal(await queue.count(), 1);
  });

  it('should ack and not re-enqueue', async () => {
    const queue = new InMemoryWorkflowQueue();
    await queue.enqueue('wf-1');
    await queue.dequeue('worker-1');
    await queue.ack('wf-1');
    await queue.reject('wf-1');
    assert.equal(await queue.count(), 0);
  });

  it('should peek without removing', async () => {
    const queue = new InMemoryWorkflowQueue();
    await queue.enqueue('wf-1');
    await queue.enqueue('wf-2');
    const items = await queue.peek();
    assert.deepEqual(items, ['wf-1', 'wf-2']);
    assert.equal(await queue.count(), 2);
  });

  it('should clear all items', async () => {
    const queue = new InMemoryWorkflowQueue();
    await queue.enqueue('wf-1');
    await queue.enqueue('wf-2');
    await queue.clear();
    assert.equal(await queue.count(), 0);
  });

  it('should not enqueue duplicates', async () => {
    const queue = new InMemoryWorkflowQueue();
    await queue.enqueue('wf-1');
    await queue.enqueue('wf-1');
    assert.equal(await queue.count(), 1);
  });
});

describe('LeaseManager — acquire, release, renew', () => {
  it('should acquire a lease', async () => {
    const storage = new InMemoryWorkflowStorage();
    const leaseManager = new LeaseManager({ storage, workerId: 'worker-1' });

    const result = await leaseManager.acquire('wf-1', 1000);
    assert.equal(result.status, 'acquired');
    assert.equal(result.workerId, 'worker-1');
    assert.equal(result.workflowId, 'wf-1');
  });

  it('should reject lease when another worker holds it', async () => {
    const storage = new InMemoryWorkflowStorage();
    const lm1 = new LeaseManager({ storage, workerId: 'worker-1' });
    const lm2 = new LeaseManager({ storage, workerId: 'worker-2' });

    await lm1.acquire('wf-1', 60000);
    const result = await lm2.acquire('wf-1', 60000);
    assert.equal(result.status, 'rejected');
  });

  it('should allow lease steal after expiry', async () => {
    const storage = new InMemoryWorkflowStorage();
    const lm1 = new LeaseManager({ storage, workerId: 'worker-1' });
    const lm2 = new LeaseManager({ storage, workerId: 'worker-2' });

    await lm1.acquire('wf-1', 1);
    await new Promise(r => setTimeout(r, 10));

    const result = await lm2.acquire('wf-1', 60000);
    assert.equal(result.status, 'acquired');
  });

  it('should release a lease', async () => {
    const storage = new InMemoryWorkflowStorage();
    const leaseManager = new LeaseManager({ storage, workerId: 'worker-1' });

    await leaseManager.acquire('wf-1', 60000);
    const result = await leaseManager.release('wf-1');
    assert.equal(result.status, 'released');
  });

  it('should renew a lease', async () => {
    const storage = new InMemoryWorkflowStorage();
    const leaseManager = new LeaseManager({ storage, workerId: 'worker-1' });

    await leaseManager.acquire('wf-1', 60000);
    const renewed = await leaseManager.renew('wf-1', 60000);
    assert.equal(renewed, true);
  });

  it('should not renew a lease held by another worker', async () => {
    const storage = new InMemoryWorkflowStorage();
    const lm1 = new LeaseManager({ storage, workerId: 'worker-1' });
    const lm2 = new LeaseManager({ storage, workerId: 'worker-2' });

    await lm1.acquire('wf-1', 60000);
    const renewed = await lm2.renew('wf-1', 60000);
    assert.equal(renewed, false);
  });

  it('should list stuck workflows', async () => {
    const storage = new InMemoryWorkflowStorage();
    const ctx = new WorkflowContext({ id: 'stuck-1', status: 'running' });
    await storage.saveWorkflow(ctx);
    await storage.heartbeat('stuck-1', 'worker-1', 1);
    await new Promise(r => setTimeout(r, 10));

    const leaseManager = new LeaseManager({ storage, workerId: 'worker-2' });
    const stuck = await leaseManager.listStuck(1);
    assert.ok(stuck.length > 0);
    assert.ok(stuck.some(w => w.id === 'stuck-1'));
  });
});

describe('HeartbeatManager — periodic heartbeat', () => {
  it('should start and stop heartbeats', async () => {
    const storage = new InMemoryWorkflowStorage();
    const hb = new HeartbeatManager({
      storage,
      workerId: 'worker-1',
      defaultTtlMs: 60000,
      intervalMs: 50
    });

    hb.start('wf-1');
    assert.equal(hb.isBeating('wf-1'), true);
    assert.equal(hb.activeCount(), 1);

    await new Promise(r => setTimeout(r, 120));

    hb.stop('wf-1');
    assert.equal(hb.isBeating('wf-1'), false);
    assert.equal(hb.activeCount(), 0);
  });

  it('should detect stuck workflows', async () => {
    const storage = new InMemoryWorkflowStorage();
    const ctx = new WorkflowContext({ id: 'stuck-hb', status: 'running' });
    await storage.saveWorkflow(ctx);
    await storage.heartbeat('stuck-hb', 'worker-1', 1);
    await new Promise(r => setTimeout(r, 10));

    const hb = new HeartbeatManager({ storage, workerId: 'worker-2', defaultTtlMs: 60000 });
    const stuck = await hb.detectStuck(1);
    assert.ok(stuck.length > 0);
    assert.ok(stuck.some(w => w && w.id === 'stuck-hb'));
  });

  it('should stop all heartbeats', async () => {
    const storage = new InMemoryWorkflowStorage();
    const hb = new HeartbeatManager({ storage, workerId: 'worker-1', intervalMs: 100 });

    hb.start('wf-1');
    hb.start('wf-2');
    assert.equal(hb.activeCount(), 2);

    hb.stopAll();
    assert.equal(hb.activeCount(), 0);
  });
});

describe('WorkerRuntime — lifecycle', () => {
  it('should start and stop', async () => {
    const runtime = new WorkerRuntime({ pollIntervalMs: 60000, leaseTtlMs: 60000 });
    assert.equal(runtime.status, 'stopped');

    const startResult = await runtime.start();
    assert.equal(runtime.status, 'running');
    assert.equal(startResult.status, 'running');
    assert.ok(startResult.workerId);

    const stopResult = await runtime.stop();
    assert.equal(runtime.status, 'stopped');
    assert.equal(stopResult.status, 'stopped');
  });

  it('should be idempotent on start', async () => {
    const runtime = new WorkerRuntime({ pollIntervalMs: 60000, leaseTtlMs: 60000 });
    await runtime.start();
    await runtime.start();
    assert.equal(runtime.status, 'running');
    await runtime.stop();
  });

  it('should process submitted workflows on poll', async () => {
    const graph = new ExecutionGraph({ id: 'worker-poll' });
    graph.addNode('a', 'agent', { handler: async (ctx) => ({ output: 'done' }) });

    const def = new WorkflowDefinition({ id: 'wf-poll', name: 'poll-test', graph });
    const executor = new WorkflowExecutor({
      agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
    });

    const runtime = new WorkerRuntime({
      executor,
      pollIntervalMs: 50,
      leaseTtlMs: 1000
    });

    await runtime.start();
    const executeResult = await runtime.submit(def, { test: true });
    assert.equal(executeResult.success, true);
    assert.ok(executeResult.context.id);

    await new Promise(r => setTimeout(r, 300));

    const stored = await runtime.storage.loadWorkflow(executeResult.context.id);
    assert.ok(stored);
    assert.equal(stored.status, 'completed');

    await runtime.stop();
  });

  it('should handle execution errors gracefully', async () => {
    const graph = new ExecutionGraph({ id: 'worker-err' });
    graph.addNode('a', 'agent', { handler: async (ctx) => { throw new Error('SIMULATED_ERROR'); } });

    const def = new WorkflowDefinition({ id: 'wf-err', name: 'error-test', graph });
    const executor = new WorkflowExecutor({
      agentRuntime: { async execute(context, handler) { try { await handler(context); return { success: true }; } catch (err) { return { success: false, errors: [{ message: err.message }] }; } } }
    });

    const runtime = new WorkerRuntime({
      executor,
      pollIntervalMs: 50,
      leaseTtlMs: 1000
    });

    await runtime.start();
    const executeResult = await runtime.submit(def, {});
    assert.equal(executeResult.success, false);

    await new Promise(r => setTimeout(r, 300));

    await runtime.stop();
  });
});

describe('Distributed — two workers, same workflow', () => {
  it('should only execute once across two workers', async () => {
    let executionCount = 0;

    const graph = new ExecutionGraph({ id: 'dist-2w' });
    graph.addNode('a', 'agent', { handler: async (ctx) => { executionCount++; return { output: 'done' }; } });

    const def = new WorkflowDefinition({ id: 'wf-dist-2w', name: 'dist-2w', graph });
    const executor = new WorkflowExecutor({
      agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
    });

    const storage = executor.storage;
    const runtime1 = new WorkerRuntime({ executor, storage, pollIntervalMs: 50, leaseTtlMs: 1000, workerId: 'worker-A' });
    const runtime2 = new WorkerRuntime({ executor, storage, pollIntervalMs: 50, leaseTtlMs: 1000, workerId: 'worker-B' });

    await runtime1.start();
    await runtime2.start();

    const executeResult = await runtime1.submit(def, {});
    assert.equal(executeResult.success, true);
    const workflowId = executeResult.context.id;

    await new Promise(r => setTimeout(r, 500));

    const stored = await storage.loadWorkflow(workflowId);
    assert.ok(stored);
    assert.equal(stored.status, 'completed');

    assert.equal(executionCount, 1, 'Node should execute only once despite two workers');

    await runtime1.stop();
    await runtime2.stop();
  });
});

describe('Distributed — worker failure recovery', () => {
  it('should recover a stuck workflow when another worker picks it up', async () => {
    const graph = new ExecutionGraph({ id: 'dist-rec' });
    graph.addNode('a', 'agent', { handler: async (ctx) => ({ output: 'recovered' }) });

    const def = new WorkflowDefinition({ id: 'wf-dist-rec', name: 'dist-rec', graph });
    const executor = new WorkflowExecutor({
      agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
    });

    const storage = executor.storage;

    const runtime1 = new WorkerRuntime({
      executor, storage,
      pollIntervalMs: 50,
      leaseTtlMs: 500,
      workerId: 'worker-fail'
    });

    await runtime1.start();

    const executeResult = await runtime1.submit(def, {});
    assert.equal(executeResult.success, true);
    const workflowId = executeResult.context.id;

    await new Promise(r => setTimeout(r, 200));

    await runtime1.stop();

    const ctx = await storage.loadWorkflow(workflowId);
    ctx.status = 'running';
    await storage.saveWorkflow(ctx);

    const runtime2 = new WorkerRuntime({
      executor, storage,
      pollIntervalMs: 50,
      leaseTtlMs: 500,
      workerId: 'worker-recovery'
    });

    await runtime2.start();
    await new Promise(r => setTimeout(r, 1200));
    await runtime2.stop();

    const recovered = await storage.loadWorkflow(workflowId);
    assert.ok(recovered);
    assert.equal(recovered.status, 'completed', 'Second worker should complete the workflow');
  });
});

describe('Distributed — 100 concurrent workflows', () => {
  it('should distribute load across workers', async () => {
    const graph = new ExecutionGraph({ id: 'dist-100' });
    graph.addNode('a', 'agent', { handler: async (ctx) => ({ output: 'processed' }) });

    const executor = new WorkflowExecutor({
      agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
    });

    const storage = executor.storage;

    const worker1 = new WorkerRuntime({ executor, storage, pollIntervalMs: 10, leaseTtlMs: 5000, workerId: 'mass-1' });
    const worker2 = new WorkerRuntime({ executor, storage, pollIntervalMs: 10, leaseTtlMs: 5000, workerId: 'mass-2' });
    const worker3 = new WorkerRuntime({ executor, storage, pollIntervalMs: 10, leaseTtlMs: 5000, workerId: 'mass-3' });
    const worker4 = new WorkerRuntime({ executor, storage, pollIntervalMs: 10, leaseTtlMs: 5000, workerId: 'mass-4' });

    await worker1.start();
    await worker2.start();
    await worker3.start();
    await worker4.start();

    const workflowIds = [];
    for (let i = 0; i < 100; i++) {
      const g = new ExecutionGraph({ id: `g-${i}` });
      g.addNode('a', 'agent', { handler: async (ctx) => ({ output: `processed-${i}` }) });
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

    // Most workflows should be completed
    assert.ok(completed >= 90, `Expected >= 90 completed, got ${completed}`);

    await worker1.stop();
    await worker2.stop();
    await worker3.stop();
    await worker4.stop();
  });
});

describe('Distributed — lease enforcement', () => {
  it('should prevent two workers from executing the same workflow simultaneously', async () => {
    const storage = new InMemoryWorkflowStorage();
    const ctx = new WorkflowContext({ id: 'lease-test', status: 'running' });
    await storage.saveWorkflow(ctx);

    const lm1 = new LeaseManager({ storage, workerId: 'worker-1' });
    const lm2 = new LeaseManager({ storage, workerId: 'worker-2' });

    const result1 = await lm1.acquire('lease-test', 60000);
    assert.equal(result1.status, 'acquired');

    const result2 = await lm2.acquire('lease-test', 60000);
    assert.equal(result2.status, 'rejected', 'Second worker should be rejected');

    await lm1.release('lease-test');
  });
});

describe('Distributed — heartbeat timeout', () => {
  it('should detect expired heartbeat', async () => {
    const storage = new InMemoryWorkflowStorage();
    const ctx = new WorkflowContext({ id: 'hb-timeout', status: 'running' });
    await storage.saveWorkflow(ctx);
    await storage.heartbeat('hb-timeout', 'worker-1', 1);
    await new Promise(r => setTimeout(r, 20));

    const hb = new HeartbeatManager({ storage, workerId: 'worker-2' });
    const stuck = await hb.detectStuck(10);
    assert.ok(stuck.length > 0);
    assert.ok(stuck.some(w => w && w.id === 'hb-timeout'));
  });
});

describe('Distributed — idempotent delivery', () => {
  it('should not double-execute nodes on duplicate delivery', async () => {
    let callCount = 0;

    const graph = new ExecutionGraph({ id: 'idemp-dist' });
    graph.addNode('a', 'agent', { handler: async (ctx) => { callCount++; return { output: 'once' }; } });

    const def = new WorkflowDefinition({ id: 'wf-idemp-dist', name: 'idemp-dist', graph });
    const executor = new WorkflowExecutor({
      agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
    });

    // Execute once normally
    const first = await executor.execute(def, {});
    assert.equal(first.success, true);

    // Resume — should skip completed node A
    const resume = await executor.resume(first.context.id);
    assert.equal(resume.success, true);

    // callCount should still be 1 (not re-executed)
    assert.equal(callCount, 1, 'Node should not be re-executed on resume');
  });
});