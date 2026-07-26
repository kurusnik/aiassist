const crypto = require('crypto');
const WorkflowExecutor = require('../WorkflowExecutor');
const { ExecutionGraph } = require('../ExecutionGraph');
const WorkflowDefinition = require('../WorkflowDefinition');
const WorkflowContext = require('../WorkflowContext');
const InMemoryWorkflowStorage = require('../storage/InMemoryWorkflowStorage');
const PostgresWorkflowStorage = require('../storage/PostgresWorkflowStorage');
const PostgresEventStore = require('../events/PostgresEventStore');
const AuditService = require('../../audit/AuditService');

class WorkflowAPI {
  constructor(options = {}) {
    this.executor = options.executor || new WorkflowExecutor();
    this.eventStore = options.eventStore || new PostgresEventStore();
    this.auditService = options.auditService || new AuditService();
    this.definitions = new Map();
    this.idempotencyStore = options.idempotencyStore || null;
    this._inMemoryIdempotency = new Map();
    this._authChecker = options.authChecker || null;
  }

  setAuthChecker(checker) {
    this._authChecker = checker;
  }

  async _checkAuth(actor, action, resource) {
    if (!this._authChecker) return true;
    return this._authChecker(actor, action, resource);
  }

  async _checkIdempotency(idempotencyKey) {
    if (!idempotencyKey) return null;
    if (this.idempotencyStore) {
      return this.idempotencyStore.check(idempotencyKey);
    }
    const existing = this._inMemoryIdempotency.get(idempotencyKey);
    if (existing) return existing;
    return null;
  }

  async _setIdempotency(idempotencyKey, workflowId) {
    if (!idempotencyKey) return;
    if (this.idempotencyStore) {
      await this.idempotencyStore.store(idempotencyKey, workflowId);
    } else {
      this._inMemoryIdempotency.set(idempotencyKey, { workflowId });
    }
  }

  registerDefinition(definition) {
    if (!(definition instanceof WorkflowDefinition)) {
      throw new Error('definition must be a WorkflowDefinition instance');
    }
    if (!definition.id) {
      throw new Error('definition must have an id');
    }
    if (!definition.graph || !(definition.graph instanceof ExecutionGraph)) {
      throw new Error('definition must have a valid ExecutionGraph');
    }
    this.definitions.set(definition.id, definition);
  }

  async createWorkflow(params = {}) {
    if (params.actor) {
      const auth = await this._checkAuth(params.actor, 'workflow:create', 'workflow');
      if (!auth) {
        return { success: false, error: 'Unauthorized', workflowId: null };
      }
    }
    const definition = params.definitionId
      ? this.definitions.get(params.definitionId)
      : null;
    if (!definition) {
      return { success: false, error: 'Definition not found', workflowId: null };
    }
    return {
      success: true,
      workflowId: null,
      definitionId: definition.id,
      status: 'created',
      message: 'Workflow definition resolved. Call startWorkflow to execute.'
    };
  }

  async startWorkflow(params = {}) {
    const idempotent = await this._checkIdempotency(params.idempotencyKey);
    if (idempotent) {
      return { success: true, workflowId: idempotent.workflowId, idempotent: true };
    }

    if (params.actor) {
      const auth = await this._checkAuth(params.actor, 'workflow:start', 'workflow');
      if (!auth) {
        return { success: false, error: 'Unauthorized' };
      }
    }

    const definition = params.definition
      ? params.definition
      : this.definitions.get(params.definitionId);

    if (!definition) {
      return { success: false, error: `Definition "${params.definitionId}" not found` };
    }

    const input = params.input || {};
    const result = await this.executor.execute(definition, input);

    if (result.success && result.context && result.context.id) {
      await this._setIdempotency(params.idempotencyKey, result.context.id);
      await this.auditService.store.append({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        actor: params.actor || 'api',
        action: 'workflow_start',
        resource: `workflow:${definition.id}`,
        workflowId: result.context.id,
        nodeId: null,
        decision: 'started',
        metadata: { definitionId: definition.id, input, idempotencyKey: params.idempotencyKey || null }
      });
    }

    return result;
  }

  async getWorkflowStatus(workflowId) {
    const context = await this.executor.storage.loadWorkflow(workflowId);
    if (!context) {
      return { success: false, error: `Workflow "${workflowId}" not found`, status: null };
    }
    return {
      success: true,
      workflowId: context.id,
      status: context.status,
      version: context._version,
      createdAt: context.createdAt,
      updatedAt: context.updatedAt,
      nodeCount: Object.keys(context.nodes || {}).length,
      metadata: context.metadata
    };
  }

  async pauseWorkflow(workflowId, params = {}) {
    const context = await this.executor.storage.loadWorkflow(workflowId);
    if (!context) {
      return { success: false, error: `Workflow "${workflowId}" not found` };
    }
    if (!context.canTransitionTo(WorkflowContext.STATUS.PAUSED)) {
      return { success: false, error: `Workflow "${workflowId}" cannot be paused (status: ${context.status})` };
    }
    context.transitionTo(WorkflowContext.STATUS.PAUSED);
    context.incrementVersion();
    await this.executor.storage.saveWorkflow(context);
    if (params.actor) {
      await this.auditService.store.append({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        actor: params.actor,
        action: 'workflow_pause',
        resource: `workflow:${workflowId}`,
        workflowId,
        nodeId: null,
        decision: 'paused',
        metadata: { workerId: this.executor.workerId || null }
      });
    }
    return { success: true, workflowId, status: WorkflowContext.STATUS.PAUSED };
  }

  async resumeWorkflow(workflowId, params = {}) {
    const idempotent = await this._checkIdempotency(params.idempotencyKey);
    if (idempotent) {
      return { success: true, workflowId, idempotent: true };
    }

    const context = await this.executor.storage.loadWorkflow(workflowId);
    if (!context) {
      return { success: false, error: `Workflow "${workflowId}" not found` };
    }
    if (!context.canTransitionTo(WorkflowContext.STATUS.RUNNING)) {
      return { success: false, error: `Workflow "${workflowId}" cannot be resumed (status: ${context.status})` };
    }

    const result = await this.executor.resume(workflowId);
    if (result.success && result.context && result.context.id) {
      await this._setIdempotency(params.idempotencyKey, result.context.id);
    }
    return result;
  }

  async cancelWorkflow(workflowId, params = {}) {
    const context = await this.executor.storage.loadWorkflow(workflowId);
    if (!context) {
      return { success: false, error: `Workflow "${workflowId}" not found` };
    }
    if (!context.canTransitionTo(WorkflowContext.STATUS.CANCELLED)) {
      return { success: false, error: `Workflow "${workflowId}" cannot be cancelled (status: ${context.status})` };
    }
    context.transitionTo(WorkflowContext.STATUS.CANCELLED);
    context.incrementVersion();
    await this.executor.storage.saveWorkflow(context);
    if (params.actor) {
      await this.auditService.store.append({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        actor: params.actor,
        action: 'workflow_cancel',
        resource: `workflow:${workflowId}`,
        workflowId,
        nodeId: null,
        decision: 'cancelled',
        metadata: {}
      });
    }
    return { success: true, workflowId, status: WorkflowContext.STATUS.CANCELLED };
  }

  async getExecutionGraph(workflowId) {
    const context = await this.executor.storage.loadWorkflow(workflowId);
    if (!context) {
      return { success: false, error: `Workflow "${workflowId}" not found`, graph: null };
    }
    return {
      success: true,
      graph: context.metadata && context.metadata.workflowDefinition
        ? context.metadata.workflowDefinition.graph
        : null
    };
  }

  async getEvents(workflowId) {
    const events = await this.eventStore.getHistory(workflowId);
    return {
      success: true,
      events: events.map(e => e.toJSON())
    };
  }

  async listWorkflows(filter = {}) {
    const running = await this.executor.storage.listRunning();
    if (filter.status) {
      return running.filter(w => w.status === filter.status).map(w => ({
        id: w.id,
        status: w.status,
        version: w._version,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt
      }));
    }
    return running.map(w => ({
      id: w.id,
      status: w.status,
      version: w._version,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt
    }));
  }
}

module.exports = WorkflowAPI;