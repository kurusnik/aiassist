// Workflow Engine Stress Test Suite
// Usage: node scripts/stress-workflow.js [test_name]

const { ExecutionGraph, ExecutionNode } = require('../services/workflow/ExecutionGraph');
const WorkflowDefinition = require('../services/workflow/WorkflowDefinition');
const WorkflowExecutor = require('../services/workflow/WorkflowExecutor');
const WorkflowContext = require('../services/workflow/WorkflowContext');
const CompensationManager = require('../services/workflow/CompensationManager');

const TEST_DURATION_MS = 30000;

function makeAgentHandler(delay = 1) {
  return async (ctx) => {
    if (delay > 0) await new Promise(r => setTimeout(r, delay));
    return { output: 'ok' };
  };
}

function createLargeGraph(nodeCount) {
  const graph = new ExecutionGraph({ id: `stress-${nodeCount}` });
  graph.addNode('root', 'agent', { handler: makeAgentHandler(0) });

  const batchSize = 10;
  for (let i = 1; i < nodeCount; i++) {
    const dep = i <= batchSize ? 'root' : `n${i - batchSize}`;
    graph.addNode(`n${i}`, 'agent', {
      handler: makeAgentHandler(0),
      dependencies: [dep]
    });
    graph.addEdge(dep, `n${i}`);
  }
  return graph;
}

function createParallelGraph(branchCount) {
  const graph = new ExecutionGraph({ id: `parallel-${branchCount}` });
  graph.addNode('start', 'agent', { handler: makeAgentHandler(1) });

  for (let i = 0; i < branchCount; i++) {
    graph.addNode(`branch${i}`, 'agent', {
      handler: makeAgentHandler(2),
      dependencies: ['start']
    });
    graph.addEdge('start', `branch${i}`);
  }

  graph.addNode('end', 'agent', {
    handler: makeAgentHandler(1),
    dependencies: Array.from({ length: branchCount }, (_, i) => `branch${i}`)
  });
  for (let i = 0; i < branchCount; i++) {
    graph.addEdge(`branch${i}`, 'end');
  }
  return graph;
}

async function testLargeDAG(nodeCount) {
  console.log(`\n=== Test: Large DAG (${nodeCount} nodes) ===`);
  const graph = createLargeGraph(nodeCount);
  const def = new WorkflowDefinition({ id: `large-${nodeCount}`, name: 'large', graph });
  const executor = new WorkflowExecutor({
    agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
  });

  const start = Date.now();
  const result = await executor.execute(def, {});
  const duration = Date.now() - start;

  console.log(`  Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`  Duration: ${duration}ms`);
  console.log(`  Nodes executed: ${result.metrics.nodesExecuted}`);
  console.log(`  Nodes/s: ${(result.metrics.nodesExecuted / (duration / 1000)).toFixed(1)}`);

  return { success: result.success, duration, nodes: result.metrics.nodesExecuted };
}

async function testParallelExecution(branchCount) {
  console.log(`\n=== Test: Parallel Execution (${branchCount} branches) ===`);
  const graph = createParallelGraph(branchCount);
  const def = new WorkflowDefinition({ id: `parallel-${branchCount}`, name: 'parallel', graph });
  const executor = new WorkflowExecutor({
    agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
  });

  const start = Date.now();
  const result = await executor.execute(def, {});
  const duration = Date.now() - start;

  const expectedMin = branchCount * 2 + 2;
  console.log(`  Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`  Duration: ${duration}ms (expected min: ~${expectedMin}ms with parallel)`);
  console.log(`  Nodes executed: ${result.metrics.nodesExecuted}`);

  return { success: result.success, duration, nodes: result.metrics.nodesExecuted };
}

async function testRestartRecovery() {
  console.log('\n=== Test: Restart Recovery ===');
  const graph = new ExecutionGraph({ id: 'recovery-stress' });
  graph.addNode('A', 'agent', { handler: makeAgentHandler(1) });
  graph.addNode('B', 'agent', { handler: async (ctx) => { throw new Error('SIMULATED_CRASH'); }, dependencies: ['A'] });
  graph.addNode('C', 'agent', { handler: makeAgentHandler(1), dependencies: ['B'] });
  graph.addEdge('A', 'B');
  graph.addEdge('B', 'C');

  const def = new WorkflowDefinition({ id: 'recovery-stress-def', name: 'recovery', graph });

  // First executor fails
  const executor1 = new WorkflowExecutor({
    agentRuntime: { async execute(context, handler) { try { const r = await handler(context); return { ...r, success: true }; } catch (err) { return { success: false, errors: [{ message: err.message }] }; } } }
  });
  const first = await executor1.execute(def, {});
  console.log(`  First execution: ${first.success ? 'SUCCESS' : 'FAILED'}`);
  const workflowId = first.context.id;

  // Second executor recovers with fixed handler
  const graph2 = new ExecutionGraph({ id: 'recovery-stress' });
  graph2.addNode('A', 'agent', { handler: makeAgentHandler(1) });
  graph2.addNode('B', 'agent', { handler: makeAgentHandler(1), dependencies: ['A'] });
  graph2.addNode('C', 'agent', { handler: makeAgentHandler(1), dependencies: ['B'] });
  graph2.addEdge('A', 'B');
  graph2.addEdge('B', 'C');

  const def2 = new WorkflowDefinition({ id: 'recovery-stress-def', name: 'recovery', graph: graph2 });
  const executor2 = new WorkflowExecutor({
    agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
  });
  executor2.storage = executor1.storage;
  const storedCtx = await executor2.storage.loadWorkflow(workflowId);
  storedCtx.metadata.workflowDefinition = def2;
  storedCtx.status = 'running';
  await executor2.storage.saveWorkflow(storedCtx);
  await executor2.storage.updateNodeState(workflowId, 'A', { status: 'completed', result: { success: true, nodeId: 'A' } });

  const resume = await executor2.resume(workflowId);
  console.log(`  Recovery resume: ${resume.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`  Resumed: ${resume.resumed}`);
  console.log(`  Nodes executed on resume: ${resume.metrics.nodesExecuted}`);

  return { success: resume.success, resumed: resume.resumed };
}

async function testConcurrentWorkflows(count) {
  console.log(`\n=== Test: Concurrent Workflows (${count} instances) ===`);
  const results = [];
  const start = Date.now();

  const promises = Array.from({ length: count }, async (_, i) => {
    const graph = new ExecutionGraph({ id: `concurrent-${i}` });
    graph.addNode('step1', 'agent', { handler: makeAgentHandler(1) });
    graph.addNode('step2', 'agent', { handler: makeAgentHandler(1), dependencies: ['step1'] });
    graph.addEdge('step1', 'step2');

    const def = new WorkflowDefinition({ id: `concurrent-def-${i}`, name: 'concurrent', graph });
    const executor = new WorkflowExecutor({
      agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
    });

    const wfResult = await executor.execute(def, {});
    results.push({ index: i, success: wfResult.success, duration: wfResult.duration });
    return wfResult;
  });

  await Promise.all(promises);
  const totalDuration = Date.now() - start;
  const successful = results.filter(r => r.success).length;

  console.log(`  Total duration: ${totalDuration}ms`);
  console.log(`  Successful: ${successful}/${count}`);
  console.log(`  Avg per workflow: ${(totalDuration / count).toFixed(1)}ms`);

  return { success: successful === count, totalDuration, successful, count };
}

async function testLongRunningWorkflow() {
  console.log('\n=== Test: Long-running Workflow (simulated) ===');
  const graph = new ExecutionGraph({ id: 'long' });
  graph.addNode('start', 'agent', { handler: async (ctx) => { await new Promise(r => setTimeout(r, 100)); return { output: 'started' }; } });
  graph.addNode('wait', 'condition', { handler: async (ctx) => { ctx.setVariable('ready', true); return true; }, dependencies: ['start'] });
  graph.addEdge('start', 'wait');

  const def = new WorkflowDefinition({ id: 'long-running', name: 'long-running', graph });
  const executor = new WorkflowExecutor({
    agentRuntime: { async execute(context, handler) { const r = await handler(context); return { ...r, success: true }; } }
  });

  const start = Date.now();
  await executor.execute(def, {});

  // Simulate pause/resume cycle
  const running = await executor.storage.listRunning();
  if (running.length > 0) {
    const ctx = running[0];
    ctx.status = 'paused';
    await executor.storage.saveWorkflow(ctx);
    console.log(`  Paused workflow: ${ctx.id}`);

    await new Promise(r => setTimeout(r, 50));
    ctx.status = 'running';
    await executor.storage.saveWorkflow(ctx);
    console.log(`  Resumed workflow: ${ctx.id}`);
  }

  const duration = Date.now() - start;
  console.log(`  Total test duration: ${duration}ms`);
  return { success: true, duration };
}

async function main() {
  const testName = process.argv[2] || 'all';
  const results = {};

  console.log('=== Workflow Engine Stress Tests ===');
  console.log(`Node.js version: ${process.version}`);
  console.log(`Test timeout: ${TEST_DURATION_MS}ms per test`);

  try {
    if (testName === 'all' || testName === 'large-dag') {
      results.large100 = await testLargeDAG(100);
      results.large500 = await testLargeDAG(500);
    }
    if (testName === 'all' || testName === 'parallel') {
      results.parallel10 = await testParallelExecution(10);
      results.parallel100 = await testParallelExecution(100);
    }
    if (testName === 'all' || testName === 'recovery') {
      results.recovery = await testRestartRecovery();
    }
    if (testName === 'all' || testName === 'concurrent') {
      results.concurrent = await testConcurrentWorkflows(100);
    }
    if (testName === 'all' || testName === 'long-running') {
      results.longRunning = await testLongRunningWorkflow();
    }

    console.log('\n=== RESULTS SUMMARY ===');
    for (const [name, result] of Object.entries(results)) {
      console.log(`  ${name}: ${result.success ? 'PASS' : 'FAIL'}`);
    }

    const allPassed = Object.values(results).every(r => r.success);
    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error('Stress test error:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  testLargeDAG,
  testParallelExecution,
  testRestartRecovery,
  testConcurrentWorkflows,
  testLongRunningWorkflow
};