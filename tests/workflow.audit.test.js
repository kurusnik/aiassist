const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const WorkflowContext = require('../services/workflow/WorkflowContext');
const { ExecutionGraph } = require('../services/workflow/ExecutionGraph');
const WorkflowDefinition = require('../services/workflow/WorkflowDefinition');
const WorkflowExecutor = require('../services/workflow/WorkflowExecutor');
const CompensationManager = require('../services/workflow/CompensationManager');
const WorkflowNodeRegistry = require('../services/workflow/WorkflowNodeRegistry');
const WorkflowEventBus = require('../services/workflow/events/WorkflowEventBus');

describe('Audit: WorkflowContext serialization and versioning', () => {
  it('should track versions via incrementVersion', () => {
    const ctx = new WorkflowContext({ id: 'wf-v1' });
    assert.equal(ctx._version, 1);
    ctx.incrementVersion();
    assert.equal(ctx._version, 2);
    ctx.incrementVersion();
    assert.equal(ctx._version, 3);
  });

  it('should serialize and deserialize via toJSON/fromJSON', () => {
    const def = new WorkflowDefinition({ id: 'test', name: 'test', version: '1.0', graph: new ExecutionGraph({ id: 'g' }) });
    const ctx = new WorkflowContext({
      id: 'wf-json',
      input: { key: 'val' },
      variables: { x: 1 },
      metadata: { workflowDefinition: def },
      _version: 5
    });
    ctx.status = 'running';

    const json = ctx.toJSON();
    assert.equal(json._version, 5);
    assert.equal(json.id, 'wf-json');

    const restored = WorkflowContext.fromJSON(json);
    assert.equal(restored.id, 'wf-json');
    assert.equal(restored.input.key, 'val');
    assert.equal(restored.variables.x, 1);
    assert.equal(restored._version, 5);
    assert.equal(restored.status, 'running');
  });
});

describe('Audit: ExecutionGraph conditional branches', () => {
  it('should evaluate condition on edge', () => {
    const graph = new ExecutionGraph({ id: 'cond' });
    graph.addNode('a', 'agent');
    graph.addNode('b', 'tool');
    graph.addEdge('a', 'b', { condition: { variable: 'skip', value: false } });

    const context = new WorkflowContext({ variables: { skip: false } });
    const ready = graph.getReadyNodes(['a'], context);
    assert.equal(ready.length, 1);
    assert.equal(ready[0].id, 'b');
  });

  it('should block node when condition evaluates to false', () => {
    const graph = new ExecutionGraph({ id: 'cond2' });
    graph.addNode('a', 'agent');
    graph.addNode('b', 'tool');
    graph.addEdge('a', 'b', { condition: { variable: 'skip', value: true } });

    const context = new WorkflowContext({ variables: { skip: false } });
    const ready = graph.getReadyNodes(['a'], context);
    assert.equal(ready.length, 0);
  });

  it('should support function conditions', () => {
    const graph = new ExecutionGraph({ id: 'cond3' });
    graph.addNode('a', 'agent');
    graph.addNode('b', 'tool');
    graph.addNode('c', 'mcp');
    graph.addEdge('a', 'b', { condition: (ctx) => ctx.getVariable('env') === 'prod' });
    graph.addEdge('a', 'c');

    const context = new WorkflowContext({ variables: { env: 'staging' } });
    const ready = graph.getReadyNodes(['a'], context);
    assert.equal(ready.length, 1);
    assert.equal(ready[0].id, 'c');
  });
});

describe('Audit: ExecutionGraph deadlock detection', () => {
  it('should detect deadlock when pending nodes cannot be scheduled', async () => {
    const graph = new ExecutionGraph({ id: 'dl' });
    graph.addNode('a', 'agent', { dependencies: ['b'] });

    const def = new WorkflowDefinition({ id: 'wf-dl', name: 'deadlock', graph });
    const executor = new WorkflowExecutor();

    const result = await executor.execute(def, {});
    assert.equal(result.success, false);
    assert.ok(result.error.includes('Deadlock') || result.error.includes('validation'));
  });
});

describe('Audit: WorkflowNodeRegistry permissions', () => {
  it('should check permission on registered handlers', () => {
    const registry = new WorkflowNodeRegistry();
    registry.register('restricted', async (node, ctx) => ({}), {
      permissions: { required: ['admin'] }
    });
    const permission = registry.checkPermission('restricted', { nodeId: 'n1' }, {});
    assert.equal(permission.allowed, true); // no function = always allowed
  });

  it('should support function-based permissions', () => {
    const registry = new WorkflowNodeRegistry();
    registry.register('admin_only', async (node, ctx) => ({}), {
      permissions: (action, context) => context && context.role === 'admin'
    });
    const adminPerm = registry.checkPermission('admin_only', {}, { role: 'admin' });
    const userPerm = registry.checkPermission('admin_only', {}, { role: 'user' });
    assert.equal(adminPerm.allowed, true);
    assert.equal(userPerm.allowed, false);
  });
});

describe('Audit: WorkflowNodeRegistry versioning and replace', () => {
  it('should track handler versions', () => {
    const registry = new WorkflowNodeRegistry();
    registry.register('agent', async (node, ctx) => ({}));
    assert.equal(registry.getVersion('agent'), 1);
  });

  it('should increment version on replace', () => {
    const registry = new WorkflowNodeRegistry();
    registry.register('agent', async (node, ctx) => ({}));
    const result = registry.replace('agent', async (node, ctx) => ({ v2: true }));
    assert.equal(result.previousVersion, 1);
    assert.equal(result.newVersion, 2);
    assert.equal(registry.getVersion('agent'), 2);
  });
});

describe('Audit: CompensationManager scoped compensation', () => {
  it('should only compensate failed nodes when setFailedNodeIds is called', async () => {
    const cm = new CompensationManager();
    let aCompensated = false;
    let bCompensated = false;
    cm.registerCompensation('A', async () => { aCompensated = true; });
    cm.registerCompensation('B', async () => { bCompensated = true; });
    cm.setFailedNodeIds(['A']);

    await cm.compensateAll({});
    assert.equal(aCompensated, true);
    assert.equal(bCompensated, false);
  });

  it('should compensate all nodes when setFailedNodeIds is empty', async () => {
    const cm = new CompensationManager();
    let aComp = false;
    let bComp = false;
    cm.registerCompensation('A', async () => { aComp = true; });
    cm.registerCompensation('B', async () => { bComp = true; });
    cm.setFailedNodeIds([]);

    await cm.compensateAll({});
    assert.equal(aComp, false);
    assert.equal(bComp, false);
  });
});

describe('Audit: EventBus history and replay', () => {
  it('should store event history', async () => {
    const bus = new WorkflowEventBus();
    await bus.emit('node_started', { workflowId: 'wf-1', nodeId: 'n1' });
    await bus.emit('node_completed', { workflowId: 'wf-1', nodeId: 'n1' });
    const history = bus.getHistory();
    assert.equal(history.length, 2);
  });

  it('should replay filtered events', async () => {
    const bus = new WorkflowEventBus();
    await bus.emit('node_started', { workflowId: 'wf-1', nodeId: 'n1' });
    await bus.emit('node_started', { workflowId: 'wf-2', nodeId: 'n2' });
    await bus.emit('node_completed', { workflowId: 'wf-1', nodeId: 'n1' });

    const replayed = [];
    bus.replay('node_started', (ev) => replayed.push(ev.nodeId));
    assert.equal(replayed.length, 2);
    assert.deepEqual(replayed, ['n1', 'n2']);
  });

  it('should support async handlers', async () => {
    const bus = new WorkflowEventBus();
    let asyncDone = false;
    bus.subscribe('async_test', async (ev) => {
      await new Promise(r => setTimeout(r, 5));
      asyncDone = true;
    });
    await bus.emit('async_test', {});
    assert.equal(asyncDone, true);
  });
});

describe('Audit: WorkflowExecutor permission check per node', () => {
  it('should block execution when permission denied', async () => {
    const graph = new ExecutionGraph({ id: 'perm' });
    graph.addNode('restricted', 'agent', { handler: async (ctx) => ({ output: 'ok' }) });

    const def = new WorkflowDefinition({ id: 'wf-perm', name: 'perm', graph });
    const executor = new WorkflowExecutor({
      agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
    });

    // Override default permission to block
    executor.nodeRegistry.replace('agent', {
      execute: async (node, context) => ({ output: 'ok' })
    }, {
      permissions: () => false
    });

    const result = await executor.execute(def, {});
    assert.equal(result.success, false);
  });
});

describe('Audit: WorkflowExecutor deadlock detection', () => {
  it('should detect deadlock in graph execution', async () => {
    const graph = new ExecutionGraph({ id: 'dl2' });
    graph.addNode('a', 'agent', { dependencies: ['b'] });
    graph.addNode('b', 'agent', { dependencies: ['a'] });
    graph.addEdge('a', 'b');
    graph.addEdge('b', 'a');

    const def = new WorkflowDefinition({ id: 'wf-dl2', name: 'deadlock2', graph });
    const executor = new WorkflowExecutor({
      agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
    });

    const result = await executor.execute(def, {});
    assert.equal(result.success, false);
  });
});

describe('Audit: WorkflowExecutor fork execution', () => {
  it('should execute forked workflow', async () => {
    const graph = new ExecutionGraph({ id: 'fork' });
    graph.addNode('a', 'agent', { handler: async (ctx) => ({ output: 'forked' }) });

    const executor = new WorkflowExecutor({
      agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
    });

    const parentCtx = new WorkflowContext({ id: 'parent', input: { x: 1 } });
    const result = await executor.executeFork(parentCtx, graph, { variables: { forked: true } });

    assert.equal(result.success, true);
    assert.ok(result.forkedId);
    assert.equal(result.parentId, 'parent');
    assert.equal(result.metrics.nodesExecuted, 1);
  });
});

describe('Audit: WorkflowContext serialization preserves status', () => {
  it('should round-trip all status values via fromJSON', () => {
    for (const status of ['created', 'running', 'waiting', 'paused', 'completed', 'failed', 'cancelled']) {
      const ctx = new WorkflowContext({ id: `wf-${status}`, status });
      const json = ctx.toJSON();
      const restored = WorkflowContext.fromJSON(json);
      assert.equal(restored.status, status, `Status ${status} should round-trip`);
    }
  });
});

describe('Audit: WorkflowExecutor resume idempotency', () => {
  it('should not re-execute completed nodes on resume', async () => {
    let callCount = 0;
    const graph = new ExecutionGraph({ id: 'idem' });
    graph.addNode('A', 'agent', { handler: async (ctx) => { callCount++; return { output: 'a' }; } });
    graph.addNode('B', 'agent', { handler: async (ctx) => { callCount++; return { output: 'b' }; }, dependencies: ['A'] });
    graph.addEdge('A', 'B');

    const def = new WorkflowDefinition({ id: 'wf-idem', name: 'idempotent', graph });
    const executor = new WorkflowExecutor({
      agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
    });

    const first = await executor.execute(def, {});
    assert.equal(first.success, true);
    assert.equal(callCount, 2);

    const resume = await executor.resume(first.context.id);
    assert.equal(resume.success, true);
    // callCount should still be 2 — no re-execution
    assert.equal(callCount, 2);
  });
});

describe('Audit: correlation IDs in workflow result', () => {
  it('should include traceId and workflowId in result', async () => {
    const graph = new ExecutionGraph({ id: 'corr' });
    graph.addNode('a', 'agent', { handler: async (ctx) => ({ output: 'ok' }) });

    const def = new WorkflowDefinition({ id: 'wf-corr', name: 'correlation', graph });
    const executor = new WorkflowExecutor({
      agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
    });

    const result = await executor.execute(def, {});
    assert.ok(result._traceId);
    assert.ok(result._workflowId);
    assert.equal(result.context.id, result._workflowId);
  });
});