const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const WorkflowContext = require('../services/workflow/WorkflowContext');
const { ExecutionGraph } = require('../services/workflow/ExecutionGraph');
const WorkflowDefinition = require('../services/workflow/WorkflowDefinition');
const WorkflowExecutor = require('../services/workflow/WorkflowExecutor');
const RetryPolicy = require('../services/workflow/RetryPolicy');
const CompensationManager = require('../services/workflow/CompensationManager');

describe('WorkflowContext — lifecycle and state', () => {
  it('should create with default values', () => {
    const ctx = new WorkflowContext();
    assert.ok(ctx.id);
    assert.ok(ctx.traceId);
    assert.equal(ctx.status, WorkflowContext.STATUS.CREATED);
    assert.equal(ctx.input, null);
    assert.deepEqual(ctx.variables, {});
  });

  it('should clone with new traceId', () => {
    const ctx = new WorkflowContext({ input: { query: 'test' }, variables: { x: 1 } });
    const cloned = ctx.clone();
    assert.equal(cloned.id, ctx.id);
    assert.notEqual(cloned.traceId, ctx.traceId);
    assert.equal(cloned.input.query, 'test');
    assert.equal(cloned.variables.x, 1);
  });

  it('should fork with inherited variables', () => {
    const ctx = new WorkflowContext({ variables: { x: 1, y: 2 } });
    const forked = ctx.fork({ variables: { y: 3, z: 4 } });
    assert.notEqual(forked.id, ctx.id);
    assert.equal(forked.variables.x, 1);
    assert.equal(forked.variables.y, 3);
    assert.equal(forked.variables.z, 4);
  });

  it('should set and get variables', () => {
    const ctx = new WorkflowContext();
    ctx.setVariable('key', 'value');
    assert.equal(ctx.getVariable('key'), 'value');
    assert.equal(ctx.getVariable('nonexistent'), undefined);
  });

  it('should serialize to JSON', () => {
    const ctx = new WorkflowContext({ input: 'test', metadata: { source: 'unit' } });
    const json = ctx.toJSON();
    assert.equal(json.id, ctx.id);
    assert.equal(json.status, WorkflowContext.STATUS.CREATED);
    assert.equal(json.input, 'test');
    assert.equal(json.metadata.source, 'unit');
    assert.ok(json.createdAt);
  });
});

describe('ExecutionGraph — DAG construction and traversal', () => {
  it('should add and get nodes', () => {
    const graph = new ExecutionGraph({ id: 'test' });
    const node = graph.addNode('node1', 'agent', { handler: 'test_handler' });
    assert.equal(node.id, 'node1');
    assert.equal(node.type, 'agent');
    assert.equal(node.handler, 'test_handler');
    assert.equal(graph.getNode('node1'), node);
    assert.equal(graph.hasNode('node1'), true);
  });

  it('should reject duplicate nodes', () => {
    const graph = new ExecutionGraph();
    graph.addNode('n1', 'agent');
    assert.throws(() => graph.addNode('n1', 'tool'), /already exists/);
  });

  it('should allow custom node types', () => {
    const graph = new ExecutionGraph();
    const node = graph.addNode('n1', 'custom_type', { handler: 'test' });
    assert.equal(node.id, 'n1');
    assert.equal(node.type, 'custom_type');
  });

  it('should add and validate edges', () => {
    const graph = new ExecutionGraph();
    graph.addNode('a', 'agent');
    graph.addNode('b', 'tool');
    const edge = graph.addEdge('a', 'b', { metadata: { label: 'dep' } });
    assert.equal(edge.from, 'a');
    assert.equal(edge.to, 'b');
    assert.equal(graph.edges.length, 1);
  });

  it('should reject edges with missing nodes', () => {
    const graph = new ExecutionGraph();
    graph.addNode('a', 'agent');
    assert.throws(() => graph.addEdge('a', 'missing'), /not found/);
    assert.throws(() => graph.addEdge('missing', 'a'), /not found/);
  });

  it('should detect cycles in validate', () => {
    const graph = new ExecutionGraph();
    graph.addNode('a', 'agent');
    graph.addNode('b', 'tool');
    graph.addNode('c', 'mcp');
    graph.addEdge('a', 'b');
    graph.addEdge('b', 'c');
    graph.addEdge('c', 'a');
    const result = graph.validate();
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Cycle')));
  });

  it('should validate acyclic graph as valid', () => {
    const graph = new ExecutionGraph();
    graph.addNode('a', 'agent');
    graph.addNode('b', 'tool');
    graph.addEdge('a', 'b');
    const result = graph.validate();
    assert.equal(result.valid, true);
  });

  it('should detect missing dependency', () => {
    const graph = new ExecutionGraph();
    graph.addNode('a', 'agent', { dependencies: ['b'] });
    const result = graph.validate();
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('depends on missing')));
  });

  it('should perform topological sort', () => {
    const graph = new ExecutionGraph();
    graph.addNode('a', 'agent');
    graph.addNode('b', 'tool');
    graph.addNode('c', 'mcp');
    graph.addEdge('a', 'b');
    graph.addEdge('a', 'c');
    graph.addEdge('b', 'c');
    const sorted = graph.topologicalSort();
    assert.equal(sorted.length, 3);
    assert.equal(sorted[0], 'a');
    assert.ok(sorted.indexOf('b') < sorted.indexOf('c'));
  });

  it('should get ready nodes', () => {
    const graph = new ExecutionGraph();
    graph.addNode('a', 'agent');
    graph.addNode('b', 'tool', { dependencies: ['a'] });
    graph.addNode('c', 'mcp', { dependencies: ['a'] });
    graph.addEdge('a', 'b');
    graph.addEdge('a', 'c');

    const initial = graph.getReadyNodes([]);
    assert.equal(initial.length, 1);
    assert.equal(initial[0].id, 'a');

    const afterA = graph.getReadyNodes(['a']);
    assert.equal(afterA.length, 2);
    assert.ok(afterA.some(n => n.id === 'b'));
    assert.ok(afterA.some(n => n.id === 'c'));
  });

  it('should serialize to JSON', () => {
    const graph = new ExecutionGraph({ id: 'g1' });
    graph.addNode('a', 'agent');
    graph.addEdge('a', 'a', { condition: 'always' });
    const json = graph.toJSON();
    assert.equal(json.id, 'g1');
    assert.equal(json.nodes.length, 1);
    assert.equal(json.edges.length, 1);
    assert.equal(json.edges[0].condition, 'always');
  });
});

describe('WorkflowDefinition — validation and serialization', () => {
  it('should create with defaults', () => {
    const def = new WorkflowDefinition({ id: 'wf-1' });
    assert.equal(def.id, 'wf-1');
    assert.equal(def.name, 'unnamed_workflow');
    assert.equal(def.version, '1.0');
  });

  it('should validate without graph', () => {
    const def = new WorkflowDefinition({ id: 'wf-1' });
    const result = def.validate();
    assert.equal(result.valid, false);
  });

  it('should validate missing id', () => {
    const def = new WorkflowDefinition({});
    const result = def.validate();
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('id is required')));
  });

  it('should validate with valid graph', () => {
    const graph = new ExecutionGraph({ id: 'g' });
    graph.addNode('a', 'agent');
    graph.addNode('b', 'tool');
    graph.addEdge('a', 'b');
    const def = new WorkflowDefinition({ id: 'wf-1', name: 'test', graph });
    const result = def.validate();
    assert.equal(result.valid, true);
  });
});

describe('RetryPolicy — retry decision and delay', () => {
  it('should retry within maxAttempts', () => {
    const policy = new RetryPolicy({ maxAttempts: 3, strategy: 'fixed', baseDelay: 100 });
    assert.equal(policy.shouldRetry(0, {}), true);
    assert.equal(policy.shouldRetry(1, {}), true);
    assert.equal(policy.shouldRetry(2, {}), true);
    assert.equal(policy.shouldRetry(3, {}), false);
  });

  it('should use fixed delay', () => {
    const policy = new RetryPolicy({ strategy: 'fixed', baseDelay: 500 });
    assert.equal(policy.getDelay(0), 500);
    assert.equal(policy.getDelay(5), 500);
  });

  it('should use exponential backoff', () => {
    const policy = new RetryPolicy({ strategy: 'exponential', baseDelay: 1000, maxDelay: 10000 });
    assert.equal(policy.getDelay(0), 1000);
    assert.equal(policy.getDelay(1), 2000);
    assert.equal(policy.getDelay(2), 4000);
    assert.equal(policy.getDelay(3), 8000);
  });

  it('should cap exponential backoff', () => {
    const policy = new RetryPolicy({ strategy: 'exponential', baseDelay: 1000, maxDelay: 5000 });
    assert.equal(policy.getDelay(4), 5000);
  });

  it('should filter retryable errors', () => {
    const policy = new RetryPolicy({ maxAttempts: 3, retryableErrors: ['TIMEOUT', 'RATE_LIMIT'] });
    assert.equal(policy.shouldRetry(0, { code: 'TIMEOUT' }), true);
    assert.equal(policy.shouldRetry(0, { code: 'RATE_LIMIT' }), true);
    assert.equal(policy.shouldRetry(0, { code: 'PERMISSION' }), false);
  });

  it('should retry all errors when retryableErrors is empty', () => {
    const policy = new RetryPolicy({ maxAttempts: 2 });
    assert.equal(policy.shouldRetry(0, { message: 'anything' }), true);
  });
});

describe('CompensationManager — sagas', () => {
  it('should register and execute compensation', async () => {
    const cm = new CompensationManager();
    let compensated = false;
    cm.registerCompensation('node1', async () => { compensated = true; });
    assert.equal(cm.count(), 1);
    const result = await cm.executeCompensation('node1');
    assert.equal(result.executed, true);
    assert.equal(compensated, true);
  });

  it('should return not found for unregistered node', async () => {
    const cm = new CompensationManager();
    const result = await cm.executeCompensation('unknown');
    assert.equal(result.executed, false);
  });

  it('should check existence', () => {
    const cm = new CompensationManager();
    cm.registerCompensation('a', async () => {});
    assert.equal(cm.hasCompensation('a'), true);
    assert.equal(cm.hasCompensation('b'), false);
  });

  it('should execute all compensations', async () => {
    const cm = new CompensationManager();
    let a = false, b = false;
    cm.registerCompensation('a', async () => { a = true; });
    cm.registerCompensation('b', async () => { b = true; });
    const results = await cm.compensateAll();
    assert.equal(results.length, 2);
    assert.equal(a, true);
    assert.equal(b, true);
  });

  it('should clear all compensations', () => {
    const cm = new CompensationManager();
    cm.registerCompensation('a', async () => {});
    cm.registerCompensation('b', async () => {});
    assert.equal(cm.count(), 2);
    cm.clear();
    assert.equal(cm.count(), 0);
  });
});

describe('WorkflowExecutor — sequential execution', () => {
  it('should execute simple sequential workflow', async () => {
    const graph = new ExecutionGraph({ id: 'seq' });
    graph.addNode('step1', 'agent', { handler: async (ctx) => ({ output: 'step1_done' }) });
    graph.addNode('step2', 'agent', { handler: async (ctx) => ({ output: 'step2_done' }), dependencies: ['step1'] });
    graph.addEdge('step1', 'step2');

    const def = new WorkflowDefinition({ id: 'wf-seq', name: 'sequential', graph });

    const executor = new WorkflowExecutor({
      agentRuntime: {
        async execute(context, handler) {
          const result = await handler(context);
          return { ...result, success: true };
        }
      }
    });

    const result = await executor.execute(def, { test: true });
    assert.equal(result.success, true);
    assert.equal(result.metrics.nodesExecuted, 2);
  });
});

describe('WorkflowExecutor — failed node', () => {
  it('should fail when a node errors', async () => {
    const graph = new ExecutionGraph({ id: 'fail' });
    graph.addNode('good', 'agent', { handler: async (ctx) => ({ output: 'ok' }) });
    graph.addNode('bad', 'agent', { handler: async (ctx) => { throw new Error('node error'); }, dependencies: ['good'] });
    graph.addEdge('good', 'bad');

    const def = new WorkflowDefinition({ id: 'wf-fail', name: 'fail', graph });

    const executor = new WorkflowExecutor({
      agentRuntime: {
        async execute(context, handler) {
          try {
            const result = await handler(context);
            return { ...result, success: true };
          } catch (err) {
            return { success: false, errors: [{ message: err.message }] };
          }
        }
      }
    });

    const result = await executor.execute(def, {});
    assert.equal(result.success, false);
    assert.ok(result.error.includes('bad'));
  });
});

describe('WorkflowExecutor — retry', () => {
  it('should retry failed nodes within policy', async () => {
    let attempts = 0;
    const graph = new ExecutionGraph({ id: 'retry' });
    graph.addNode('flaky', 'agent', {
      handler: async (ctx) => {
        attempts++;
        throw new Error('TEMPORARY_FAILURE');
      },
      retryPolicy: new RetryPolicy({ maxAttempts: 3, retryableErrors: ['TEMPORARY'] })
    });

    const def = new WorkflowDefinition({ id: 'wf-retry', name: 'retry', graph });

    const executor = new WorkflowExecutor({
      agentRuntime: {
        async execute(context, handler) {
          try {
            const result = await handler(context);
            return { ...result, success: true };
          } catch (err) {
            return { success: false, errors: [{ message: err.message }] };
          }
        }
      }
    });

    const result = await executor.execute(def, {});
    assert.equal(result.success, false);
    assert.ok(result.metrics.retryCount >= 2);
  });
});

describe('WorkflowExecutor — parallel nodes', () => {
  it('should execute independent nodes in parallel', async () => {
    const graph = new ExecutionGraph({ id: 'par' });
    graph.addNode('a', 'agent', { handler: async (ctx) => ({ output: 'a' }) });
    graph.addNode('b', 'agent', { handler: async (ctx) => ({ output: 'b' }) });
    graph.addNode('c', 'agent', { handler: async (ctx) => ({ output: 'c' }), dependencies: ['a', 'b'] });
    graph.addEdge('a', 'c');
    graph.addEdge('b', 'c');

    const def = new WorkflowDefinition({ id: 'wf-par', name: 'parallel', graph });

    const executionOrder = [];
    const executor = new WorkflowExecutor({
      agentRuntime: {
        async execute(context, handler) {
          const result = await handler(context);
          executionOrder.push(context.metadata.workflowNodeId);
          return { ...result, success: true };
        }
      }
    });

    const result = await executor.execute(def, {});
    assert.equal(result.success, true);
    assert.equal(result.metrics.nodesExecuted, 3);
  });
});

describe('WorkflowExecutor — compensation on failure', () => {
  it('should call compensation when workflow fails', async () => {
    const graph = new ExecutionGraph({ id: 'comp' });
    graph.addNode('step1', 'agent', { handler: async (ctx) => ({ output: 'ok' }) });
    graph.addNode('step2', 'agent', { handler: async (ctx) => { throw new Error('FAIL'); }, dependencies: ['step1'] });
    graph.addEdge('step1', 'step2');

    const def = new WorkflowDefinition({ id: 'wf-comp', name: 'comp', graph });
    let compensated = false;

    const compensationManager = new CompensationManager();
    compensationManager.registerCompensation('step2', async () => { compensated = true; });

    const executor = new WorkflowExecutor({
      agentRuntime: {
        async execute(context, handler) {
          try {
            const result = await handler(context);
            return { ...result, success: true };
          } catch (err) {
            return { success: false, errors: [{ message: err.message }] };
          }
        }
      },
      compensationManager
    });

    const result = await executor.execute(def, {});
    assert.equal(result.success, false);
    assert.equal(compensated, true);
  });
});

describe('WorkflowExecutor — multi-type execution', () => {
  it('should execute agent -> approval -> mcp workflow', async () => {
    const graph = new ExecutionGraph({ id: 'multi' });
    graph.addNode('agent1', 'agent', { handler: async (ctx) => ({ output: 'analyzed' }) });
    graph.addNode('approve1', 'approval', { dependencies: ['agent1'] });
    graph.addNode('mcp1', 'mcp', { metadata: { actionType: 'read', parameters: {} }, dependencies: ['approve1'] });
    graph.addEdge('agent1', 'approve1');
    graph.addEdge('approve1', 'mcp1');

    const def = new WorkflowDefinition({ id: 'wf-multi', name: 'multi-type', graph });

    const executor = new WorkflowExecutor({
      agentRuntime: {
        async execute(context, handler) {
          const result = await handler(context);
          return { ...result, success: true };
        }
      },
      approvalService: {
        async requestApproval() {
          return { status: 'approved', approvalId: 'app-1', request: {} };
        },
        async checkStatus() {
          return { status: 'approved' };
        }
      },
      mcpOrchestrator: {
        async execute(action, context) {
          return { success: true, data: { result: 'mcp_done' } };
        }
      }
    });

    const result = await executor.execute(def, {});
    assert.equal(result.success, true);
    assert.equal(result.metrics.nodesExecuted, 3);
  });
});