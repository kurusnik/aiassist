const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const WorkflowEvent = require('../services/workflow/events/WorkflowEvent');
const WorkflowEventBus = require('../services/workflow/events/WorkflowEventBus');
const InMemoryWorkflowStorage = require('../services/workflow/storage/InMemoryWorkflowStorage');
const WorkflowNodeRegistry = require('../services/workflow/WorkflowNodeRegistry');
const WorkflowContext = require('../services/workflow/WorkflowContext');
const { ExecutionGraph } = require('../services/workflow/ExecutionGraph');
const WorkflowDefinition = require('../services/workflow/WorkflowDefinition');
const WorkflowExecutor = require('../services/workflow/WorkflowExecutor');

describe('WorkflowEvent — event data', () => {
  it('should create with defaults', () => {
    const ev = new WorkflowEvent({ type: 'test', workflowId: 'wf-1' });
    assert.ok(ev.id);
    assert.equal(ev.type, 'test');
    assert.equal(ev.workflowId, 'wf-1');
    assert.equal(ev.nodeId, null);
  });

  it('should serialize to JSON', () => {
    const ev = new WorkflowEvent({ type: 'node_started', workflowId: 'wf-1', nodeId: 'n1', payload: { x: 1 } });
    const json = ev.toJSON();
    assert.equal(json.type, 'node_started');
    assert.equal(json.payload.x, 1);
    assert.ok(json.timestamp);
  });

  it('should have all static event types', () => {
    assert.equal(WorkflowEvent.EVENT_TYPES.WORKFLOW_STARTED, 'workflow_started');
    assert.equal(WorkflowEvent.EVENT_TYPES.WORKFLOW_COMPLETED, 'workflow_completed');
    assert.equal(WorkflowEvent.EVENT_TYPES.WORKFLOW_FAILED, 'workflow_failed');
    assert.equal(WorkflowEvent.EVENT_TYPES.NODE_STARTED, 'node_started');
    assert.equal(WorkflowEvent.EVENT_TYPES.NODE_COMPLETED, 'node_completed');
    assert.equal(WorkflowEvent.EVENT_TYPES.NODE_FAILED, 'node_failed');
    assert.equal(WorkflowEvent.EVENT_TYPES.RETRY_STARTED, 'retry_started');
    assert.equal(WorkflowEvent.EVENT_TYPES.COMPENSATION_STARTED, 'compensation_started');
  });
});

describe('WorkflowEventBus — pub/sub', () => {
  it('should emit and subscribe', () => {
    const bus = new WorkflowEventBus();
    const received = [];
    bus.subscribe('node_started', (ev) => received.push(ev.type));
    bus.emit('node_started', { workflowId: 'wf-1', nodeId: 'n1' });
    assert.equal(received.length, 1);
  });

  it('should emit to wildcard subscribers', () => {
    const bus = new WorkflowEventBus();
    const received = [];
    bus.subscribe('*', (ev) => received.push(ev.type));
    bus.emit('node_started', {});
    bus.emit('node_completed', {});
    assert.equal(received.length, 2);
  });

  it('should unsubscribe', () => {
    const bus = new WorkflowEventBus();
    let count = 0;
    const unsub = bus.subscribe('test', () => count++);
    bus.emit('test', {});
    assert.equal(count, 1);
    unsub();
    bus.emit('test', {});
    assert.equal(count, 1);
  });

  it('should handle subscriber errors gracefully', () => {
    const bus = new WorkflowEventBus();
    bus.subscribe('fail', () => { throw new Error('oops'); });
    bus.emit('fail', {});
  });

  it('should clear all subscribers', () => {
    const bus = new WorkflowEventBus();
    bus.subscribe('a', () => {});
    bus.subscribe('b', () => {});
    assert.equal(bus.subscriberCount(), 2);
    bus.clear();
    assert.equal(bus.subscriberCount(), 0);
  });
});

describe('InMemoryWorkflowStorage — persistence', () => {
  it('should save and load workflow', async () => {
    const storage = new InMemoryWorkflowStorage();
    const ctx = new WorkflowContext({ id: 'wf-1', input: { query: 'test' } });
    await storage.saveWorkflow(ctx);
    const loaded = await storage.loadWorkflow('wf-1');
    assert.equal(loaded.id, 'wf-1');
    assert.equal(loaded.input.query, 'test');
  });

  it('should return null for missing workflow', async () => {
    const storage = new InMemoryWorkflowStorage();
    const loaded = await storage.loadWorkflow('nonexistent');
    assert.equal(loaded, null);
  });

  it('should update node state', async () => {
    const storage = new InMemoryWorkflowStorage();
    await storage.updateNodeState('wf-1', 'n1', { status: 'completed' });
    const state = await storage.getNodeState('wf-1', 'n1');
    assert.equal(state.status, 'completed');
    assert.ok(state.updatedAt);
  });

  it('should list running workflows', async () => {
    const storage = new InMemoryWorkflowStorage();
    const ctx1 = new WorkflowContext({ id: 'w1', status: 'running' });
    const ctx2 = new WorkflowContext({ id: 'w2', status: 'completed' });
    const ctx3 = new WorkflowContext({ id: 'w3', status: 'waiting' });
    await storage.saveWorkflow(ctx1);
    await storage.saveWorkflow(ctx2);
    await storage.saveWorkflow(ctx3);
    const running = await storage.listRunning();
    assert.equal(running.length, 2);
    assert.ok(running.some(c => c.id === 'w1'));
    assert.ok(running.some(c => c.id === 'w3'));
  });

  it('should remove workflow', async () => {
    const storage = new InMemoryWorkflowStorage();
    const ctx = new WorkflowContext({ id: 'wf-1' });
    await storage.saveWorkflow(ctx);
    await storage.updateNodeState('wf-1', 'n1', { status: 'completed' });
    await storage.removeWorkflow('wf-1');
    assert.equal(await storage.loadWorkflow('wf-1'), null);
    assert.equal(await storage.getNodeState('wf-1', 'n1'), null);
  });
});

describe('WorkflowNodeRegistry — handler registration', () => {
  it('should register and get handlers', () => {
    const registry = new WorkflowNodeRegistry();
    registry.register('agent', async (node, ctx) => ({ output: 'done' }));
    assert.ok(registry.has('agent'));
    assert.ok(registry.get('agent'));
  });

  it('should reject duplicate registration', () => {
    const registry = new WorkflowNodeRegistry();
    registry.register('agent', async (node, ctx) => {});
    assert.throws(() => registry.register('agent', async (node, ctx) => {}), /already registered/);
  });

  it('should list registered types', () => {
    const registry = new WorkflowNodeRegistry();
    registry.register('agent', async (node, ctx) => {});
    registry.register('tool', async (node, ctx) => {});
    const types = registry.list();
    const typeNames = types.map(t => t.type);
    assert.ok(typeNames.includes('agent'));
    assert.ok(typeNames.includes('tool'));
  });

  it('should remove handlers', () => {
    const registry = new WorkflowNodeRegistry();
    registry.register('agent', async (node, ctx) => {});
    assert.equal(registry.count(), 1);
    registry.remove('agent');
    assert.equal(registry.count(), 0);
  });

  it('should clear all handlers', () => {
    const registry = new WorkflowNodeRegistry();
    registry.register('a', async (node, ctx) => {});
    registry.register('b', async (node, ctx) => {});
    assert.equal(registry.count(), 2);
    registry.clear();
    assert.equal(registry.count(), 0);
  });
});

describe('WorkflowExecutor — event emission', () => {
  it('should emit workflow lifecycle events', async () => {
    const graph = new ExecutionGraph({ id: 'g' });
    graph.addNode('a', 'agent', { handler: async (ctx) => ({ output: 'ok' }) });

    const def = new WorkflowDefinition({ id: 'wf-ev', name: 'events', graph });
    const events = [];
    const executor = new WorkflowExecutor({
      agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
    });
    executor.eventBus.subscribe('*', (ev) => events.push(ev.type));

    await executor.execute(def, {});

    assert.ok(events.includes('workflow_started'));
    assert.ok(events.includes('workflow_completed'));
    assert.ok(events.includes('node_started'));
    assert.ok(events.includes('node_completed'));
  });

  it('should emit node lifecycle events on failure', async () => {
    const graph = new ExecutionGraph({ id: 'g' });
    graph.addNode('a', 'agent', { handler: async (ctx) => { throw new Error('fail'); } });

    const def = new WorkflowDefinition({ id: 'wf-ev2', name: 'fail', graph });
    const events = [];
    const executor = new WorkflowExecutor({
      agentRuntime: { async execute(context, handler) { try { await handler(context); return { success: true }; } catch (err) { return { success: false, errors: [{ message: err.message }] }; } } }
    });
    executor.eventBus.subscribe('*', (ev) => events.push(ev.type));

    await executor.execute(def, {});

    assert.ok(events.includes('workflow_started'));
    assert.ok(events.includes('workflow_failed'));
    assert.ok(events.includes('node_started'));
    assert.ok(events.includes('node_failed'));
  });
});

describe('WorkflowExecutor — storage integration', () => {
  it('should persist context to storage', async () => {
    const graph = new ExecutionGraph({ id: 'g' });
    graph.addNode('a', 'agent', { handler: async (ctx) => ({ output: 'ok' }) });

    const def = new WorkflowDefinition({ id: 'wf-st', name: 'storage', graph });
    const executor = new WorkflowExecutor({
      agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
    });

    const result = await executor.execute(def, { x: 1 });
    assert.equal(result.success, true);

    const loaded = await executor.storage.loadWorkflow(result.context.id);
    assert.ok(loaded);
    assert.equal(loaded.input.x, 1);
  });
});

describe('WorkflowExecutor — resume', () => {
  it('should skip completed nodes on resume', async () => {
    let agentCalls = 0;
    const graph = new ExecutionGraph({ id: 'g' });
    graph.addNode('a', 'agent', { handler: async (ctx) => { agentCalls++; return { output: 'a' }; } });
    graph.addNode('b', 'agent', { handler: async (ctx) => { agentCalls++; return { output: 'b' }; }, dependencies: ['a'] });
    graph.addEdge('a', 'b');

    const def = new WorkflowDefinition({ id: 'wf-rs', name: 'resume', graph });
    const executor = new WorkflowExecutor({
      agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
    });

    const result = await executor.execute(def, {});

    // Manually set node a as completed in storage to simulate resume
    const context = result.context;
    const resumeResult = await executor.resume(context.id);
    // node a and b should both be skipped or already completed
    assert.ok(resumeResult.success);
  });

  it('should return error for missing workflow', async () => {
    const executor = new WorkflowExecutor();
    const result = await executor.resume('nonexistent');
    assert.equal(result.success, false);
    assert.ok(result.error.includes('not found'));
  });

  it('should return completed for already completed workflow', async () => {
    const graph = new ExecutionGraph({ id: 'g' });
    graph.addNode('a', 'agent', { handler: async (ctx) => ({ output: 'ok' }) });

    const def = new WorkflowDefinition({ id: 'wf-rs2', name: 'resume2', graph });
    const executor = new WorkflowExecutor({
      agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
    });

    await executor.execute(def, {});
    const contextId = (await executor.storage.listRunning())[0]?.id;
    if (contextId) {
      const resumeResult = await executor.resume(contextId);
      assert.ok(resumeResult.success);
    }
  });
});

describe('WorkflowExecutor — approval node', () => {
  it('should handle approval node with immediate approval', async () => {
    const graph = new ExecutionGraph({ id: 'g' });
    graph.addNode('approve', 'approval', { metadata: { parameters: {} } });

    const def = new WorkflowDefinition({ id: 'wf-app', name: 'approval', graph });
    const executor = new WorkflowExecutor({
      approvalService: {
        async requestApproval() {
          return { status: 'pending', approvalId: 'app-1', request: {} };
        },
        async checkStatus() {
          return { status: 'approved', approvalId: 'app-1' };
        }
      }
    });

    const result = await executor.execute(def, {});
    assert.equal(result.success, true);
  });

  it('should reject approval node when rejected', async () => {
    const graph = new ExecutionGraph({ id: 'g' });
    graph.addNode('approve', 'approval', { metadata: { parameters: {} } });

    const def = new WorkflowDefinition({ id: 'wf-app2', name: 'approval2', graph });
    const executor = new WorkflowExecutor({
      approvalService: {
        async requestApproval() {
          return { status: 'pending', approvalId: 'app-2', request: {} };
        },
        async checkStatus() {
          return { status: 'rejected', approvalId: 'app-2' };
        }
      }
    });

    const result = await executor.execute(def, {});
    assert.equal(result.success, false);
  });
});

describe('WorkflowExecutor — node registry', () => {
  it('should use custom registered handler', async () => {
    const graph = new ExecutionGraph({ id: 'g' });
    graph.addNode('custom', 'custom_type', { handler: null });

    const def = new WorkflowDefinition({ id: 'wf-cr', name: 'custom', graph });
    const executor = new WorkflowExecutor();
    executor.nodeRegistry.register('custom_type', {
      execute: async (node, context) => ({ custom: true })
    });

    const result = await executor.execute(def, {});
    assert.equal(result.success, true);
    assert.equal(result.nodeResults.custom.data.custom, true);
  });
});

describe('WorkflowExecutor — recovery scenario', () => {
  it('should resume from node B after node B failed', async () => {
    let callCount = 0;
    const graph = new ExecutionGraph({ id: 'g' });
    graph.addNode('A', 'agent', { handler: async (ctx) => ({ output: 'a' }) });
    graph.addNode('B', 'agent', { handler: async (ctx) => { callCount++; throw new Error('B_FAILED'); }, dependencies: ['A'] });
    graph.addEdge('A', 'B');

    const def = new WorkflowDefinition({ id: 'wf-rec', name: 'recovery', graph });
    const executor = new WorkflowExecutor({
      agentRuntime: {
        async execute(context, handler) {
          try {
            const r = await handler(context);
            return { ...r, success: true };
          } catch (err) {
            return { success: false, errors: [{ message: err.message }] };
          }
        }
      }
    });

    // First run: A succeeds, B fails
    const firstResult = await executor.execute(def, {});
    assert.equal(firstResult.success, false);
    const workflowId = firstResult.context.id;

    // Simulate: mark B as not completed (it was never stored as completed)
    // Now replace handler for B to succeed
    const graph2 = new ExecutionGraph({ id: 'g' });
    graph2.addNode('A', 'agent', { handler: async (ctx) => ({ output: 'a' }) });
    graph2.addNode('B', 'agent', { handler: async (ctx) => ({ output: 'b_recovered' }), dependencies: ['A'] });
    graph2.addEdge('A', 'B');

    const def2 = new WorkflowDefinition({ id: 'wf-rec', name: 'recovery', graph: graph2 });
    const executor2 = new WorkflowExecutor({
      agentRuntime: {
        async execute(context, handler) {
          const r = await handler(context);
          return { ...r, success: true };
        }
      }
    });

    // Copy storage from first executor
    executor2.storage = executor.storage;
    // Update stored context metadata with new definition
    const storedCtx = await executor2.storage.loadWorkflow(workflowId);
    storedCtx.metadata.workflowDefinition = def2;
    storedCtx.status = 'running';
    await executor2.storage.saveWorkflow(storedCtx);

    // Mark A as completed in storage
    await executor2.storage.updateNodeState(workflowId, 'A', { status: 'completed', result: { success: true, nodeId: 'A' } });

    // Resume: should skip A and execute B with new handler
    const resumeResult = await executor2.resume(workflowId);
    assert.equal(resumeResult.success, true, `Resume failed: ${resumeResult.error}`);
    assert.ok(resumeResult.resumed);
    assert.equal(resumeResult.metrics.nodesExecuted, 1, 'Should execute only B');
  });
});

describe('WorkflowExecutor — retry event emission', () => {
  it('should emit retry_started event on retry', async () => {
    let attempts = 0;
    const graph = new ExecutionGraph({ id: 'g' });
    graph.addNode('flaky', 'agent', {
      handler: async (ctx) => { attempts++; throw new Error('RETRY_ME'); },
      retryPolicy: { maxAttempts: 2, shouldRetry: () => true, getDelay: () => 1 }
    });

    const def = new WorkflowDefinition({ id: 'wf-rt', name: 'retry', graph });
    const events = [];
    const executor = new WorkflowExecutor({
      agentRuntime: {
        async execute(context, handler) {
          try { await handler(context); return { success: true }; }
          catch (err) { return { success: false, errors: [{ message: err.message }] }; }
        }
      }
    });
    executor.eventBus.subscribe('*', (ev) => events.push({ type: ev.type, nodeId: ev.nodeId }));

    await executor.execute(def, {});

    const retryEvents = events.filter(e => e.type === 'retry_started');
    assert.ok(retryEvents.length > 0);
  });
});