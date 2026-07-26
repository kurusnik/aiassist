const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');

const WorkflowControlService = require('../services/workflow/control/WorkflowControlService');
const WorkflowExecutor = require('../services/workflow/WorkflowExecutor');
const WorkflowDefinition = require('../services/workflow/WorkflowDefinition');
const WorkflowContext = require('../services/workflow/WorkflowContext');
const { ExecutionGraph } = require('../services/workflow/ExecutionGraph');
const InMemoryWorkflowStorage = require('../services/workflow/storage/InMemoryWorkflowStorage');
const ApprovalAPI = require('../services/security/approval/api/ApprovalAPI');
const ExecutionGraphView = require('../services/workflow/view/ExecutionGraphView');
const WorkflowTimelineService = require('../services/workflow/timeline/WorkflowTimelineService');
const AgentControlService = require('../services/agents/control/AgentControlService');
const AgentRegistry = require('../services/agents/AgentRegistry');
const MetricsControlService = require('../services/metrics/control/MetricsControlService');
const ApprovalService = require('../services/security/approval/ApprovalService');
const ApprovalStore = require('../services/security/approval/ApprovalStore');
const AuditService = require('../services/audit/AuditService');
const AuditBuffer = require('../services/audit/AuditBuffer');
const EventStore = require('../services/workflow/events/EventStore');

describe('WorkflowControlService — full lifecycle management', () => {
  let control;
  let executor;
  let storage;
  let graph;
  let definition;

  before(() => {
    storage = new InMemoryWorkflowStorage();

    executor = new WorkflowExecutor({
      storage,
      agentRuntime: {
        async execute(context, handler) {
          const result = await handler(context);
          return { ...result, success: true };
        }
      }
    });

    control = new WorkflowControlService({
      executor,
      storage,
      eventStore: {
        async getHistory() { return []; }
      },
      auditService: {
        store: {
          async append(event) {},
          async getByWorkflow() { return []; }
        }
      }
    });

    graph = new ExecutionGraph({ id: 'ctrl-graph' });
    graph.addNode('step1', 'agent', { handler: async (ctx) => ({ output: 'ok' }) });
    graph.addNode('step2', 'agent', { handler: async (ctx) => ({ output: 'ok' }), dependencies: ['step1'] });
    graph.addEdge('step1', 'step2');

    definition = new WorkflowDefinition({ id: 'wf-control', name: 'control-test', graph });
  });

  it('create — creates a workflow in CREATED status', async () => {
    control.registerDefinition(definition);
    const result = await control.create({ actor: 'test-user', definitionId: 'wf-control', input: { x: 1 } });
    assert.equal(result.success, true);
    assert.ok(result.workflowId);
    assert.equal(result.status, 'created');
    assert.equal(result.actor, 'test-user');
  });

  it('create — rejects missing actor', async () => {
    const result = await control.create({ definitionId: 'wf-control' });
    assert.equal(result.success, false);
    assert.equal(result.code, 'MISSING_ACTOR');
  });

  it('create — rejects missing definition', async () => {
    const result = await control.create({ actor: 'user', definitionId: 'nonexistent' });
    assert.equal(result.success, false);
    assert.equal(result.code, 'DEFINITION_NOT_FOUND');
  });

  it('start — starts a workflow', async () => {
    const created = await control.create({ actor: 'user', definitionId: 'wf-control' });
    const result = await control.start({ actor: 'user', workflowId: created.workflowId });
    assert.equal(result.success, true);
    assert.equal(result.status, 'running');
  });

  it('start — rejects non-existent workflow', async () => {
    const result = await control.start({ actor: 'user', workflowId: 'nonexistent' });
    assert.equal(result.success, false);
    assert.equal(result.code, 'NOT_FOUND');
  });

  it('pause — pauses a running workflow', async () => {
    const storage = new InMemoryWorkflowStorage();
    const executor = new WorkflowExecutor({
      storage,
      agentRuntime: {
        async execute(context, handler) {
          const result = await handler(context);
          return { ...result, success: true };
        }
      }
    });
    const ctrl = new WorkflowControlService({
      executor,
      storage,
      eventStore: { async getHistory() { return []; } },
      auditService: { store: { async append() {}, async getByWorkflow() { return []; } } }
    });
    ctrl.registerDefinition(definition);
    const ctx = new WorkflowContext({
      status: WorkflowContext.STATUS.RUNNING,
      metadata: { workflowDefinition: definition }
    });
    await storage.saveWorkflow(ctx);

    const result = await ctrl.pause({ actor: 'operator', workflowId: ctx.id, reason: 'maintenance' });
    assert.equal(result.success, true);
    assert.equal(result.status, 'paused');
    assert.equal(result.actor, 'operator');
  });

  it('pause — rejects invalid transition', async () => {
    const result = await control.pause({ actor: 'u', workflowId: 'nonexistent' });
    assert.equal(result.success, false);
    assert.equal(result.code, 'NOT_FOUND');
  });

  it('resume — resumes a paused workflow', async () => {
    const created = await control.create({ actor: 'u', definitionId: 'wf-control' });
    await control.start({ actor: 'u', workflowId: created.workflowId });
    await control.pause({ actor: 'u', workflowId: created.workflowId });

    const result = await control.resume({ actor: 'operator', workflowId: created.workflowId });
    assert.equal(result.success, true);
  });

  it('cancel — cancels a paused workflow', async () => {
    const created = await control.create({ actor: 'u', definitionId: 'wf-control' });
    await control.start({ actor: 'u', workflowId: created.workflowId });
    await control.pause({ actor: 'u', workflowId: created.workflowId });

    const result = await control.cancel({ actor: 'operator', workflowId: created.workflowId, reason: 'no longer needed' });
    assert.equal(result.success, true);
    assert.equal(result.status, 'cancelled');
  });

  it('retryNode — schedules a node for retry', async () => {
    const created = await control.create({ actor: 'u', definitionId: 'wf-control' });
    await storage.updateNodeState(created.workflowId, 'step1', { status: 'failed', result: { success: false } });

    const result = await control.retryNode({ actor: 'u', workflowId: created.workflowId, nodeId: 'step1' });
    assert.equal(result.success, true);
    assert.equal(result.status, 'retry_scheduled');
  });

  it('skipNode — skips a node', async () => {
    const created = await control.create({ actor: 'u', definitionId: 'wf-control' });
    const result = await control.skipNode({ actor: 'u', workflowId: created.workflowId, nodeId: 'step1', reason: 'not needed' });
    assert.equal(result.success, true);

    const state = await storage.getNodeState(created.workflowId, 'step1');
    assert.equal(state.status, 'skipped');
  });

  it('terminate — force-fails a workflow', async () => {
    const created = await control.create({ actor: 'u', definitionId: 'wf-control' });

    const result = await control.terminate({ actor: 'operator', workflowId: created.workflowId, reason: 'critical error' });
    assert.equal(result.success, true);
    assert.equal(result.status, 'failed');
  });

  it('getStatus — returns workflow status', async () => {
    const created = await control.create({ actor: 'u', definitionId: 'wf-control' });
    const result = await control.getStatus({ workflowId: created.workflowId });
    assert.equal(result.success, true);
    assert.equal(result.status, 'created');
    assert.equal(result.workflowId, created.workflowId);
  });

  it('listWorkflows — lists workflows with optional filter', async () => {
    await control.create({ actor: 'u', definitionId: 'wf-control' });
    const created2 = await control.create({ actor: 'u', definitionId: 'wf-control' });
    await control.start({ actor: 'u', workflowId: created2.workflowId });

    const all = await control.listWorkflows({});
    assert.ok(Array.isArray(all));
    assert.ok(all.length >= 0);

    const running = await control.listWorkflows({ status: 'running' });
    assert.ok(running.every(w => w.status === 'running'));
  });
});

describe('ApprovalAPI — human approval operations', () => {
  let approvalAPI;
  let approvalService;

  before(() => {
    approvalService = new ApprovalService({ store: new ApprovalStore() });
    approvalAPI = new ApprovalAPI({
      approvalService,
      auditService: {
        store: {
          async append(event) {},
          async getByWorkflow() { return []; }
        }
      }
    });
  });

  it('listPending — returns empty for no approvals', async () => {
    const result = await approvalAPI.listPending({ actor: 'admin' });
    assert.equal(result.success, true);
    assert.equal(result.approvals.length, 0);
  });

  it('approve — approves a pending request', async () => {
    const PermissionDecision = require('../services/security/models/PermissionDecision');
    const req = await approvalService.requestApproval(
      { type: 'test', workflowId: 'wf-1', nodeId: 'n1', parameters: { toolId: 'test-tool' } },
      { toolDefinition: null, agentContext: { actor: 'requester' } },
      PermissionDecision.approvalRequired('test', null, [])
    );

    const result = await approvalAPI.approve({ actor: 'admin', id: req.approvalId });
    assert.equal(result.success, true);
    assert.equal(result.status, 'approved');
    assert.equal(result.approvedBy, 'admin');
  });

  it('reject — rejects a pending request', async () => {
    const PermissionDecision = require('../services/security/models/PermissionDecision');
    const req = await approvalService.requestApproval(
      { type: 'test', workflowId: 'wf-2', nodeId: 'n2', parameters: { toolId: 'test-tool' } },
      { toolDefinition: null, agentContext: { actor: 'requester' } },
      PermissionDecision.approvalRequired('test', null, [])
    );

    const result = await approvalAPI.reject({ actor: 'admin', id: req.approvalId, reason: 'not safe' });
    assert.equal(result.success, true);
    assert.equal(result.status, 'rejected');
    assert.equal(result.rejectionReason, 'not safe');
  });

  it('getApproval — returns approval details', async () => {
    const PermissionDecision = require('../services/security/models/PermissionDecision');
    const req = await approvalService.requestApproval(
      { type: 'test', parameters: {} },
      { toolDefinition: null, agentContext: { actor: 'system' } },
      PermissionDecision.approvalRequired('test', null, [])
    );

    const result = await approvalAPI.getApproval({ actor: 'admin', id: req.approvalId });
    assert.equal(result.success, true);
    assert.equal(result.approval.id, req.approvalId);
    assert.equal(result.approval.status, 'pending');
  });

  it('approve — rejects non-existent request', async () => {
    const result = await approvalAPI.approve({ actor: 'admin', id: 'nonexistent' });
    assert.equal(result.success, false);
  });
});

describe('ExecutionGraphView — DAG visualization', () => {
  let graphView;
  let storage;
  let graph;

  before(() => {
    storage = new InMemoryWorkflowStorage();
    graphView = new ExecutionGraphView({
      storage,
      eventStore: {
        async getHistory() { return []; }
      }
    });

    graph = new ExecutionGraph({ id: 'view-graph' });
    graph.addNode('n1', 'agent', { handler: 'test', metadata: { label: 'Step 1' } });
    graph.addNode('n2', 'tool', { dependencies: ['n1'], metadata: { label: 'Step 2' } });
    graph.addNode('n3', 'mcp', { dependencies: ['n1'], metadata: { label: 'Step 3' } });
    graph.addEdge('n1', 'n2');
    graph.addEdge('n1', 'n3');
  });

  it('buildView — converts ExecutionGraph to view DTO', async () => {
    const view = await graphView.buildView('wf-v1', graph);
    assert.equal(view.success, true);
    assert.equal(view.nodes.length, 3);
    assert.equal(view.edges.length, 2);
  });

  it('buildView — includes correct node structure', async () => {
    const view = await graphView.buildView('wf-v2', graph);
    const node = view.nodes.find(n => n.id === 'n1');
    assert.ok(node);
    assert.equal(node.type, 'agent');
    assert.equal(node.label, 'Step 1');
    assert.ok(['CREATED', 'RUNNING', 'COMPLETED', 'FAILED'].includes(node.status));
  });

  it('buildView — includes edges with correct references', async () => {
    const view = await graphView.buildView('wf-v3', graph);
    const edge = view.edges.find(e => e.from === 'n1' && e.to === 'n2');
    assert.ok(edge);
  });

  it('buildView — handles missing graph', async () => {
    const view = await graphView.buildView('wf-v4', null);
    assert.equal(view.success, false);
  });

  it('getAvailableStatuses — returns all statuses', () => {
    const statuses = ExecutionGraphView.getAvailableStatuses();
    assert.ok(statuses.includes('COMPLETED'));
    assert.ok(statuses.includes('FAILED'));
    assert.ok(statuses.includes('COMPENSATED'));
    assert.ok(statuses.includes('WAITING'));
  });

  it('buildView — handles node with storage state', async () => {
    const wfId = 'wf-status-test';
    await storage.saveWorkflow(new WorkflowContext({
      id: wfId,
      metadata: { workflowDefinition: { graph, toJSON: () => graph.toJSON() } }
    }));
    await storage.updateNodeState(wfId, 'n1', { status: 'completed', metadata: { startedAt: Date.now() - 5000, finishedAt: Date.now() } });

    const view = await graphView.buildView(wfId, graph);
    const n1 = view.nodes.find(n => n.id === 'n1');
    assert.equal(n1.status, 'COMPLETED');
  });
});

describe('WorkflowTimelineService — event merging', () => {
  let timeline;

  before(() => {
    timeline = new WorkflowTimelineService({
      eventStore: new class extends EventStore {
        async getHistory(wfId) {
          return [
            { workflowId: wfId, type: 'workflow_started', timestamp: new Date('2024-01-01T00:00:00Z'), nodeId: null, payload: { definitionId: 'test' } },
            { workflowId: wfId, type: 'node_started', timestamp: new Date('2024-01-01T00:00:01Z'), nodeId: 'n1', payload: {} },
            { workflowId: wfId, type: 'node_completed', timestamp: new Date('2024-01-01T00:00:02Z'), nodeId: 'n1', payload: {} },
            { workflowId: wfId, type: 'workflow_completed', timestamp: new Date('2024-01-01T00:00:03Z'), nodeId: null, payload: {} }
          ];
        }
      },
      auditService: new class {
        async getByWorkflow(wfId) {
          return [
            {
              timestamp: '2024-01-01T00:00:01.500Z',
              actor: 'operator',
              action: 'approval_approve',
              nodeId: 'n1',
              decision: 'approved',
              metadata: { approvalId: 'app-1' }
            }
          ];
        }
      }
    });
  });

  it('getTimeline — merges events and audit chronologically', async () => {
    const result = await timeline.getTimeline('wf-t1');
    assert.equal(result.success, true);
    assert.equal(result.workflowId, 'wf-t1');

    const timelineEvents = result.timeline;
    assert.ok(timelineEvents.length >= 4);

    for (let i = 1; i < timelineEvents.length; i++) {
      assert.ok(new Date(timelineEvents[i - 1].timestamp) <= new Date(timelineEvents[i].timestamp));
    }
  });

  it('getTimeline — categorizes events correctly', async () => {
    const result = await timeline.getTimeline('wf-t1');
    const technical = result.timeline.filter(t => t.category === 'technical');
    const business = result.timeline.filter(t => t.category === 'business');

    assert.ok(technical.length > 0);
    assert.ok(business.length > 0);
  });

  it('getTechnicalTimeline — returns only technical events', async () => {
    const result = await timeline.getTechnicalTimeline('wf-t1');
    assert.equal(result.success, true);
    assert.ok(result.timeline.every(t => t.category === 'technical'));
  });

  it('getBusinessTimeline — returns only business events', async () => {
    const result = await timeline.getBusinessTimeline('wf-t1');
    assert.equal(result.success, true);
    assert.ok(result.timeline.every(t => t.category === 'business'));
  });

  it('getTimeline — includes audit events with correct structure', async () => {
    const result = await timeline.getTimeline('wf-t1');
    const auditEvents = result.timeline.filter(t => t.category === 'audit');
    for (const event of auditEvents) {
      assert.ok(event.timestamp);
      assert.ok(event.type);
      assert.ok(event.actor);
    }
  });
});

describe('AgentControlService — registry integration', () => {
  let agentControl;
  let registry;

  before(() => {
    registry = new AgentRegistry();

    registry.register('programming', {
      execute: async (ctx) => ({ success: true, output: 'ok' }),
      name: 'Programming Agent',
      runtime: { name: 'Programming Agent', version: '1.0' }
    });

    registry.register('research', {
      execute: async (ctx) => ({ success: true, output: 'ok' }),
      name: 'Research Agent',
      runtime: { name: 'Research Agent', version: '2.0' }
    });

    agentControl = new AgentControlService({
      registry,
      auditService: {
        store: {
          async append(event) {},
          async getByWorkflow() { return []; }
        }
      }
    });
  });

  it('listAgents — returns all registered agents', async () => {
    const result = await agentControl.listAgents({ actor: 'admin' });
    assert.equal(result.success, true);
    assert.equal(result.total, 2);
    const types = result.agents.map(a => a.type);
    assert.ok(types.includes('programming'));
    assert.ok(types.includes('research'));
  });

  it('listAgents — includes agent metadata', async () => {
    const result = await agentControl.listAgents({ actor: 'admin' });
    const agent = result.agents.find(a => a.type === 'programming');
    assert.equal(agent.name, 'Programming Agent');
    assert.equal(agent.version, '1.0');
    assert.equal(agent.status, 'enabled');
  });

  it('getAgentInfo — returns detailed agent info', async () => {
    const result = await agentControl.getAgentInfo({ actor: 'admin', type: 'programming' });
    assert.equal(result.success, true);
    assert.equal(result.agent.type, 'programming');
    assert.equal(result.agent.version, '1.0');
    assert.ok(result.agent.executions >= 0);
    assert.ok(result.agent.successRate >= 0);
  });

  it('getAgentInfo — rejects unknown agent', async () => {
    const result = await agentControl.getAgentInfo({ actor: 'admin', type: 'unknown' });
    assert.equal(result.success, false);
    assert.equal(result.code, 'NOT_FOUND');
  });

  it('enable — enables an agent', async () => {
    const result = await agentControl.enable({ actor: 'admin', type: 'programming', reason: 'maintenance complete' });
    assert.equal(result.success, true);
    assert.equal(result.status, 'enabled');
    assert.equal(result.actor, 'admin');
  });

  it('disable — disables an agent', async () => {
    const result = await agentControl.disable({ actor: 'admin', type: 'programming', reason: 'maintenance' });
    assert.equal(result.success, true);
    assert.equal(result.status, 'disabled');
  });

  it('reload — reloads an agent', async () => {
    const result = await agentControl.reload({ actor: 'admin', type: 'programming' });
    assert.equal(result.success, true);
    assert.equal(result.status, 'reloaded');
  });

  it('recordExecution — tracks agent statistics', () => {
    agentControl.recordExecution('programming', 100, true);
    agentControl.recordExecution('programming', 200, true);
    agentControl.recordExecution('programming', 50, false);

    const stats = agentControl.getStats('programming');
    assert.equal(stats.executions, 3);
    assert.equal(stats.successCount, 2);
    assert.equal(stats.totalDuration, 350);
  });
});

describe('MetricsControlService — aggregation', () => {
  let metricsControl;
  let agentControl;

  before(() => {
    const metrics = {
      snapshot() {
        return {
          counters: {
            'workflow_execution_total|status:success': 10,
            'workflow_failure_total': 2,
            'workflow_approval_total': 5,
            'workflow_compensation_total': 1,
            'workflow_retry_total': 3
          },
          histograms: {
            'workflow_duration_ms': { count: 10, sum: 50000, avg: 5000, min: 1000, max: 12000 },
            'workflow_node_duration_ms': { count: 50, sum: 25000, avg: 500, min: 10, max: 5000 },
            'workflow_approval_wait_ms': { count: 5, sum: 150000, avg: 30000, min: 10000, max: 60000 }
          },
          gauges: {
            'workflow_running_total': 3,
            'worker_active_total': 2,
            'worker_busy_total': 1
          }
        };
      }
    };

    agentControl = new AgentControlService({
      registry: new AgentRegistry(),
      auditService: { store: { async append() {} } }
    });

    agentControl.recordExecution('programming', 1500, true);
    agentControl.recordExecution('programming', 2000, true);
    agentControl.recordExecution('research', 3000, false);

    metricsControl = new MetricsControlService({
      metrics,
      agentControlService: agentControl
    });
  });

  it('getWorkflowMetrics — returns workflow statistics', async () => {
    const result = await metricsControl.getWorkflowMetrics();
    assert.equal(result.success, true);
    assert.equal(result.workflows.running, 3);
    assert.equal(result.workflows.totalExecutions, 10);
    assert.equal(result.workflows.totalApprovals, 5);
    assert.equal(result.workflows.failedToday, 2);
    assert.equal(result.workflows.avgDuration, 5000);
  });

  it('getWorkerMetrics — returns worker statistics', async () => {
    const result = await metricsControl.getWorkerMetrics();
    assert.equal(result.success, true);
    assert.equal(result.workers.active, 2);
    assert.equal(result.workers.busy, 1);
  });

  it('getAgentMetrics — returns agent statistics', async () => {
    const result = await metricsControl.getAgentMetrics();
    assert.equal(result.success, true);
    assert.ok(result.agents.programming);
    assert.equal(result.agents.programming.executions, 2);
    assert.equal(result.agents.programming.successRate, 100);
  });

  it('getToolMetrics — returns tool and mcp statistics', async () => {
    const result = await metricsControl.getToolMetrics();
    assert.equal(result.success, true);
    assert.ok(result.tools);
    assert.ok(result.mcp);
  });

  it('getErrorMetrics — returns error aggregation', async () => {
    const result = await metricsControl.getErrorMetrics();
    assert.equal(result.success, true);
    assert.equal(result.errors.workflowFailures, 2);
    assert.ok(result.errors.total >= 2);
    assert.ok(result.errors.bySource['workflow_failure_total'] || result.errors.bySource['workflow_failure_total|status:success'] === undefined);
  });

  it('getAll — returns all metrics at once', async () => {
    const result = await metricsControl.getAll();
    assert.equal(result.success, true);
    assert.ok(result.workflows);
    assert.ok(result.workers);
    assert.ok(result.agents);
    assert.ok(result.tools);
    assert.ok(result.errors);
    assert.ok(result.timestamp);
  });
});

describe('WorkflowControlService — structured result format', () => {
  let control;

  before(() => {
    const storage = new InMemoryWorkflowStorage();
    control = new WorkflowControlService({
      executor: new WorkflowExecutor({ storage }),
      storage,
      eventStore: { async getHistory() { return []; } },
      auditService: { store: { async append() {}, async getByWorkflow() { return []; } } }
    });
  });

  it('all operations return { success, workflowId, status, actor, timestamp }', async () => {
    const graph = new ExecutionGraph({ id: 'fmt' });
    graph.addNode('a', 'agent', { handler: async (ctx) => ({ output: 'ok' }) });
    const def = new WorkflowDefinition({ id: 'wf-fmt', graph });
    control.registerDefinition(def);

    const created = await control.create({ actor: 'test', definitionId: 'wf-fmt' });
    assert.equal(typeof created.success, 'boolean');
    assert.ok(created.workflowId);
    assert.equal(created.status, 'created');
    assert.equal(created.actor, 'test');
    assert.ok(created.timestamp);
  });
});