const crypto = require('crypto');
const WorkflowContext = require('../WorkflowContext');
const WorkflowDefinition = require('../WorkflowDefinition');
const { ExecutionGraph } = require('../ExecutionGraph');
const WorkflowExecutor = require('../WorkflowExecutor');
const EventStore = require('../events/EventStore');
const PostgresEventStore = require('../events/PostgresEventStore');
const AuditService = require('../../audit/AuditService');
const WorkflowMetrics = require('../metrics').WorkflowMetrics;

class WorkflowControlService {
  constructor(options = {}) {
    this.executor = options.executor || null;
    this.storage = options.storage || (this.executor ? this.executor.storage : null);
    this.eventStore = options.eventStore || new PostgresEventStore();
    this.auditService = options.auditService || new AuditService();
    this.metrics = options.metrics || new WorkflowMetrics();
    this._definitions = new Map();
    this._authChecker = options.authChecker || null;
  }

  setExecutor(executor) {
    this.executor = executor;
    if (!this.storage) this.storage = executor.storage;
  }

  registerDefinition(definition) {
    if (!(definition instanceof WorkflowDefinition)) {
      throw new Error('definition must be a WorkflowDefinition instance');
    }
    this._definitions.set(definition.id, definition);
  }

  async _checkAuth(actor, action, resource) {
    if (!this._authChecker) return true;
    return this._authChecker(actor, action, resource);
  }

  async _audit(actor, action, resource, workflowId, nodeId, decision, metadata = {}) {
    await this.auditService.store.append({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor,
      action,
      resource,
      workflowId,
      nodeId,
      decision,
      metadata
    });
  }

  async _requireActor(params) {
    if (!params.actor) {
      return { success: false, error: 'actor is required', code: 'MISSING_ACTOR' };
    }
    const auth = await this._checkAuth(params.actor, 'workflow:control', params.definitionId || 'workflow');
    if (!auth) {
      return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }
    return null;
  }

  async _ensureExecutor() {
    if (!this.executor) {
      throw new Error('WorkflowExecutor not configured. Call setExecutor() first.');
    }
  }

  async create(params = {}) {
    const authError = await this._requireActor(params);
    if (authError) return authError;

    const definitionId = params.definitionId;
    const definition = this._definitions.get(definitionId);
    if (!definition) {
      return { success: false, error: `Definition "${definitionId}" not found`, code: 'DEFINITION_NOT_FOUND' };
    }

    const context = new WorkflowContext({
      input: params.input || {},
      metadata: {
        workflowId: definition.id,
        workflowName: definition.name,
        workflowVersion: definition.version,
        workflowDefinition: definition,
        createdBy: params.actor,
        reason: params.reason || null
      }
    });

    await this.storage.saveWorkflow(context);

    await this._audit(
      params.actor,
      'workflow:create',
      `workflow:${context.id}`,
      context.id,
      null,
      'created',
      { definitionId, reason: params.reason || null }
    );

    return {
      success: true,
      workflowId: context.id,
      status: WorkflowContext.STATUS.CREATED,
      actor: params.actor,
      timestamp: new Date().toISOString()
    };
  }

  async start(params = {}) {
    const authError = await this._requireActor(params);
    if (authError) return authError;

    await this._ensureExecutor();

    const workflowId = params.workflowId;
    const context = await this.storage.loadWorkflow(workflowId);
    if (!context) {
      return { success: false, error: `Workflow "${workflowId}" not found`, code: 'NOT_FOUND' };
    }

    if (context.status !== WorkflowContext.STATUS.CREATED) {
      return { success: false, error: `Workflow "${workflowId}" cannot be started (status: ${context.status})`, code: 'INVALID_STATUS' };
    }

    const definition = context.metadata && context.metadata.workflowDefinition;
    if (!definition) {
      return { success: false, error: `Workflow "${workflowId}" has no stored definition`, code: 'NO_DEFINITION' };
    }

    const result = await this.executor.execute(definition, context.input);

    await this._audit(
      params.actor,
      'workflow:start',
      `workflow:${workflowId}`,
      workflowId,
      null,
      result.success ? 'started' : 'failed',
      { reason: params.reason || null, success: result.success, error: result.error || null }
    );

    return {
      success: result.success,
      workflowId,
      status: result.success ? WorkflowContext.STATUS.RUNNING : WorkflowContext.STATUS.FAILED,
      actor: params.actor,
      timestamp: new Date().toISOString(),
      error: result.error || null,
      metrics: result.metrics || {}
    };
  }

  async pause(params = {}) {
    const authError = await this._requireActor(params);
    if (authError) return authError;

    await this._ensureExecutor();

    const workflowId = params.workflowId;
    const context = await this.storage.loadWorkflow(workflowId);
    if (!context) {
      return { success: false, error: `Workflow "${workflowId}" not found`, code: 'NOT_FOUND' };
    }

    if (!context.canTransitionTo(WorkflowContext.STATUS.PAUSED)) {
      return { success: false, error: `Workflow "${workflowId}" cannot be paused (status: ${context.status})`, code: 'INVALID_STATUS' };
    }

    context.transitionTo(WorkflowContext.STATUS.PAUSED);
    context.incrementVersion();
    await this.storage.saveWorkflow(context);

    await this._audit(
      params.actor,
      'workflow:pause',
      `workflow:${workflowId}`,
      workflowId,
      null,
      'paused',
      { reason: params.reason || null, workerId: this.executor.workerId || null }
    );

    return {
      success: true,
      workflowId,
      status: WorkflowContext.STATUS.PAUSED,
      actor: params.actor,
      timestamp: new Date().toISOString()
    };
  }

  async resume(params = {}) {
    const authError = await this._requireActor(params);
    if (authError) return authError;

    await this._ensureExecutor();

    const workflowId = params.workflowId;
    const context = await this.storage.loadWorkflow(workflowId);
    if (!context) {
      return { success: false, error: `Workflow "${workflowId}" not found`, code: 'NOT_FOUND' };
    }

    if (!context.canTransitionTo(WorkflowContext.STATUS.RUNNING)) {
      return { success: false, error: `Workflow "${workflowId}" cannot be resumed (status: ${context.status})`, code: 'INVALID_STATUS' };
    }

    const result = await this.executor.resume(workflowId);

    await this._audit(
      params.actor,
      'workflow:resume',
      `workflow:${workflowId}`,
      workflowId,
      null,
      result.success ? 'resumed' : 'failed',
      { reason: params.reason || null, success: result.success, error: result.error || null }
    );

    return {
      success: result.success,
      workflowId,
      status: result.success ? WorkflowContext.STATUS.RUNNING : WorkflowContext.STATUS.FAILED,
      actor: params.actor,
      timestamp: new Date().toISOString(),
      error: result.error || null,
      metrics: result.metrics || {}
    };
  }

  async cancel(params = {}) {
    const authError = await this._requireActor(params);
    if (authError) return authError;

    await this._ensureExecutor();

    const workflowId = params.workflowId;
    const context = await this.storage.loadWorkflow(workflowId);
    if (!context) {
      return { success: false, error: `Workflow "${workflowId}" not found`, code: 'NOT_FOUND' };
    }

    if (!context.canTransitionTo(WorkflowContext.STATUS.CANCELLED)) {
      return { success: false, error: `Workflow "${workflowId}" cannot be cancelled (status: ${context.status})`, code: 'INVALID_STATUS' };
    }

    context.transitionTo(WorkflowContext.STATUS.CANCELLED);
    context.incrementVersion();
    await this.storage.saveWorkflow(context);

    await this._audit(
      params.actor,
      'workflow:cancel',
      `workflow:${workflowId}`,
      workflowId,
      null,
      'cancelled',
      { reason: params.reason || null }
    );

    return {
      success: true,
      workflowId,
      status: WorkflowContext.STATUS.CANCELLED,
      actor: params.actor,
      timestamp: new Date().toISOString()
    };
  }

  async retryNode(params = {}) {
    const authError = await this._requireActor(params);
    if (authError) return authError;

    await this._ensureExecutor();

    const { workflowId, nodeId } = params;
    const context = await this.storage.loadWorkflow(workflowId);
    if (!context) {
      return { success: false, error: `Workflow "${workflowId}" not found`, code: 'NOT_FOUND' };
    }

    const nodeState = await this.storage.getNodeState(workflowId, nodeId);
    if (!nodeState) {
      return { success: false, error: `Node "${nodeId}" not found in workflow "${workflowId}"`, code: 'NODE_NOT_FOUND' };
    }

    await this.storage.updateNodeState(workflowId, nodeId, {
      status: 'pending',
      result: null
    });

    await this._audit(
      params.actor,
      'workflow:retry_node',
      `workflow:${workflowId}/node:${nodeId}`,
      workflowId,
      nodeId,
      'retry_scheduled',
      { reason: params.reason || null }
    );

    return {
      success: true,
      workflowId,
      nodeId,
      status: 'retry_scheduled',
      actor: params.actor,
      timestamp: new Date().toISOString()
    };
  }

  async skipNode(params = {}) {
    const authError = await this._requireActor(params);
    if (authError) return authError;

    await this._ensureExecutor();

    const { workflowId, nodeId } = params;
    const context = await this.storage.loadWorkflow(workflowId);
    if (!context) {
      return { success: false, error: `Workflow "${workflowId}" not found`, code: 'NOT_FOUND' };
    }

    await this.storage.updateNodeState(workflowId, nodeId, {
      status: 'skipped',
      result: { success: true, skipped: true, nodeId }
    });

    await this._audit(
      params.actor,
      'workflow:skip_node',
      `workflow:${workflowId}/node:${nodeId}`,
      workflowId,
      nodeId,
      'skipped',
      { reason: params.reason || null }
    );

    return {
      success: true,
      workflowId,
      nodeId,
      status: 'skipped',
      actor: params.actor,
      timestamp: new Date().toISOString()
    };
  }

  async terminate(params = {}) {
    const authError = await this._requireActor(params);
    if (authError) return authError;

    await this._ensureExecutor();

    const workflowId = params.workflowId;
    const context = await this.storage.loadWorkflow(workflowId);
    if (!context) {
      return { success: false, error: `Workflow "${workflowId}" not found`, code: 'NOT_FOUND' };
    }

    context.transitionTo(WorkflowContext.STATUS.FAILED);
    context.incrementVersion();
    await this.storage.saveWorkflow(context);

    await this._audit(
      params.actor,
      'workflow:terminate',
      `workflow:${workflowId}`,
      workflowId,
      null,
      'terminated',
      { reason: params.reason || null }
    );

    return {
      success: true,
      workflowId,
      status: WorkflowContext.STATUS.FAILED,
      actor: params.actor,
      timestamp: new Date().toISOString()
    };
  }

  async getStatus(params = {}) {
    const workflowId = params.workflowId;
    const context = await this.storage.loadWorkflow(workflowId);
    if (!context) {
      return { success: false, error: `Workflow "${workflowId}" not found`, code: 'NOT_FOUND' };
    }

    const nodeStates = {};
    if (context.nodes) {
      for (const nodeId of Object.keys(context.nodes)) {
        const state = await this.storage.getNodeState(workflowId, nodeId);
        nodeStates[nodeId] = state || { status: 'unknown' };
      }
    }

    return {
      success: true,
      workflowId: context.id,
      status: context.status,
      version: context._version,
      createdAt: new Date(context.createdAt).toISOString(),
      updatedAt: new Date(context.updatedAt).toISOString(),
      nodeCount: Object.keys(context.nodes || {}).length,
      nodes: nodeStates,
      metadata: context.metadata
    };
  }

  async getTimeline(params = {}) {
    const workflowId = params.workflowId;
    const events = await this.eventStore.getHistory(workflowId);
    const auditEvents = await this.auditService.getByWorkflow(workflowId);

    const timeline = [];

    for (const event of events) {
      timeline.push({
        timestamp: event.timestamp,
        type: event.type,
        actor: 'workflow_engine',
        nodeId: event.nodeId,
        metadata: event.payload
      });
    }

    for (const audit of auditEvents) {
      timeline.push({
        timestamp: audit.timestamp,
        type: `audit:${audit.action}`,
        actor: audit.actor,
        nodeId: audit.nodeId,
        metadata: { decision: audit.decision, ...audit.metadata }
      });
    }

    timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return {
      success: true,
      workflowId,
      timeline,
      total: timeline.length
    };
  }

  async listWorkflows(filter = {}) {
    const running = await this.storage.listRunning();
    let items = running;

    if (filter.status) {
      items = items.filter(w => w.status === filter.status);
    }

    return items.map(w => ({
      id: w.id,
      status: w.status,
      version: w._version,
      createdAt: new Date(w.createdAt).toISOString(),
      updatedAt: new Date(w.updatedAt).toISOString()
    }));
  }
}

WorkflowControlService.STATUS = WorkflowContext.STATUS;

module.exports = WorkflowControlService;