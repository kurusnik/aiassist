const crypto = require('crypto');
const WorkflowContext = require('./WorkflowContext');
const { ExecutionGraph } = require('./ExecutionGraph');
const RetryPolicy = require('./RetryPolicy');
const CompensationManager = require('./CompensationManager');
const WorkflowEventBus = require('./events/WorkflowEventBus');
const WorkflowEvent = require('./events/WorkflowEvent');
const InMemoryWorkflowStorage = require('./storage/InMemoryWorkflowStorage');
const WorkflowNodeRegistry = require('./WorkflowNodeRegistry');

const PIPELINE_STEPS = [
  'workflow_created',
  'workflow_validation',
  'workflow_execution',
  'workflow_node_start',
  'workflow_node_complete',
  'workflow_failed'
];

class WorkflowExecutor {
  constructor(options = {}) {
    this.agentRuntime = options.agentRuntime || null;
    this.toolRegistry = options.toolRegistry || null;
    this.mcpOrchestrator = options.mcpOrchestrator || null;
    this.approvalService = options.approvalService || null;
    this.nodeRegistry = options.nodeRegistry || new WorkflowNodeRegistry();
    this.eventBus = options.eventBus || new WorkflowEventBus();
    this.storage = options.storage || new InMemoryWorkflowStorage();
    this.retryPolicy = options.retryPolicy || new RetryPolicy();
    this.compensationManager = options.compensationManager || new CompensationManager();
    this.diagnostics = options.diagnostics || null;
    this.auditService = options.auditService || null;
    this.workerId = options.workerId || `worker-${crypto.randomUUID().slice(0, 8)}`;
  }

  _registerDefaults() {
    if (!this.nodeRegistry.has('agent')) {
      this.nodeRegistry.register('agent', {
        execute: async (node, context) => {
          const AgentContext = require('../agents/AgentContext');
          const agentRuntime = this._resolveService('agentRuntime');
          const agentContext = new AgentContext({
            traceId: context.traceId,
            queryContext: context.input,
            metadata: {
              workflowNodeId: node.id,
              workflowId: context.id
            }
          });
          const result = await agentRuntime.execute(agentContext, node.handler);
          if (!result.success) {
            throw new Error(result.errors ? result.errors.map(e => e.message).join('; ') : 'Agent execution failed');
          }
          if (this.auditService) {
            await this.auditService.recordAgentExecution(agentContext, result);
          }
          return result;
        }
      }, {
        permissions: { required: ['agent:execute'] }
      });
    }
    if (!this.nodeRegistry.has('tool')) {
      this.nodeRegistry.register('tool', {
        execute: async (node, context) => {
          const toolRegistry = this._resolveService('toolRegistry');
          const tool = toolRegistry.get(node.handler);
          if (!tool) {
            throw new Error(`Tool "${node.handler}" not found`);
          }
          const params = node.metadata.parameters || {};
          const result = await tool.execute(params);
          if (this.auditService) {
            await this.auditService.recordToolExecution(node.handler, params, result);
          }
          return result;
        }
      }, {
        permissions: { required: ['tool:execute'] }
      });
    }
    if (!this.nodeRegistry.has('mcp')) {
      this.nodeRegistry.register('mcp', {
        execute: async (node, context) => {
          const mcpOrchestrator = this._resolveService('mcpOrchestrator');
          const action = {
            type: node.metadata.actionType || 'mcp',
            parameters: node.metadata.parameters || {}
          };
          const result = await mcpOrchestrator.execute(action, {
            agentContext: context,
            metadata: { workflowNodeId: node.id, workflowId: context.id }
          });
          if (this.auditService) {
            await this.auditService.recordMCPExecution(action, { workflowId: context.id, nodeId: node.id }, result);
          }
          if (!result.success) {
            throw new Error(result.error || 'MCP execution failed');
          }
          return result;
        }
      }, {
        permissions: { required: ['mcp:execute'] }
      });
    }
    if (!this.nodeRegistry.has('approval')) {
      this.nodeRegistry.register('approval', {
        execute: async (node, context) => {
          if (!this.approvalService) {
            throw new Error('ApprovalService not configured');
          }
          const PermissionDecision = require('../security/models/PermissionDecision');
          const action = {
            type: 'workflow_approval',
            parameters: node.metadata.parameters || {},
            workflowId: context.id,
            nodeId: node.id
          };
          const approval = await this.approvalService.requestApproval(
            action,
            {
              toolDefinition: null,
              agentContext: {
                traceId: context.traceId,
                workflowId: context.id,
                workflowNodeId: node.id
              }
            },
            PermissionDecision.approvalRequired('Workflow approval required', null, [])
          );
          const approved = await this._waitForApproval(approval.approvalId);
          if (!approved) {
            throw new Error(`Approval "${approval.approvalId}" not granted`);
          }
          return approval;
        }
      }, {
        permissions: { required: ['approval:request'] }
      });
    }
    if (!this.nodeRegistry.has('condition')) {
      this.nodeRegistry.register('condition', {
        execute: async (node, context) => {
          if (typeof node.handler === 'function') {
            return node.handler(context);
          }
          const variableName = node.metadata.variable;
          const expectedValue = node.metadata.value;
          if (variableName !== undefined) {
            return context.getVariable(variableName) === expectedValue;
          }
          return true;
        }
      });
    }
  }

  _resolveService(name) {
    if (this[name]) return this[name];
    throw new Error(`${name} not configured`);
  }

  async execute(definition, input = {}) {
    const start = Date.now();

    const trace = this.diagnostics && typeof this.diagnostics.createPipelineTrace === 'function'
      ? this.diagnostics.createPipelineTrace(
          this.diagnostics.createTraceContext('workflow_execution')
        )
      : null;

    const context = new WorkflowContext({
      input,
      metadata: {
        workflowId: definition.id,
        workflowName: definition.name,
        workflowVersion: definition.version,
        workflowDefinition: definition
      }
    });

    let workflowResult;

    try {
      if (trace && this.diagnostics) {
        await this._diagnosticStep(trace, 'workflow_created', {
          workflowId: definition.id,
          definitionId: definition.id,
          traceId: context.traceId
        });
      }

      const validation = definition.validate();
      if (!validation.valid) {
        throw new Error(`Workflow validation failed: ${validation.errors.join('; ')}`);
      }

      if (trace && this.diagnostics) {
        await this._diagnosticStep(trace, 'workflow_validation', { valid: true });
      }

      context.transitionTo(WorkflowContext.STATUS.RUNNING);
      context.incrementVersion();
      await this.storage.saveWorkflow(context);

      this._registerDefaults();

      this.eventBus.emit(WorkflowEvent.EVENT_TYPES.WORKFLOW_STARTED, {
        workflowId: context.id,
        payload: { definitionId: definition.id }
      });

      if (this.auditService) {
        await this.auditService.store.append({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          actor: 'workflow_executor',
          action: 'workflow_start',
          resource: `workflow:${definition.id}`,
          workflowId: context.id,
          nodeId: null,
          decision: 'started',
          metadata: { definitionId: definition.id, workerId: this.workerId }
        });
      }

      workflowResult = await this._executeGraph(definition.graph, context, trace);

      if (workflowResult.success) {
        context.transitionTo(WorkflowContext.STATUS.COMPLETED);
        context.incrementVersion();
        this.eventBus.emit(WorkflowEvent.EVENT_TYPES.WORKFLOW_COMPLETED, {
          workflowId: context.id,
          payload: { nodesExecuted: workflowResult.metrics.nodesExecuted }
        });
        if (this.auditService) {
          await this.auditService.store.append({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            actor: 'workflow_executor',
            action: 'workflow_complete',
            resource: `workflow:${definition.id}`,
            workflowId: context.id,
            nodeId: null,
            decision: 'completed',
            metadata: { nodesExecuted: workflowResult.metrics.nodesExecuted, workerId: this.workerId }
          });
        }
      } else {
        context.transitionTo(WorkflowContext.STATUS.FAILED);
        context.incrementVersion();
        this.eventBus.emit(WorkflowEvent.EVENT_TYPES.WORKFLOW_FAILED, {
          workflowId: context.id,
          payload: { error: workflowResult.error }
        });
        if (this.auditService) {
          await this.auditService.store.append({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            actor: 'workflow_executor',
            action: 'workflow_fail',
            resource: `workflow:${definition.id}`,
            workflowId: context.id,
            nodeId: null,
            decision: 'failed',
            metadata: { error: workflowResult.error, workerId: this.workerId }
          });
        }
        const failedIds = (workflowResult.nodeResults
          ? Object.entries(workflowResult.nodeResults)
              .filter(([_, r]) => !r.success)
              .map(([id]) => id)
          : []);
        this.compensationManager.setFailedNodeIds(failedIds);
        await this.compensationManager.compensateAll(context);
      }

      await this.storage.saveWorkflow(context);
    } catch (err) {
      context.transitionTo(WorkflowContext.STATUS.FAILED);
      context.incrementVersion();

      if (trace && this.diagnostics) {
        await this._diagnosticStep(trace, 'workflow_failed', { error: err.message });
      }

      this.eventBus.emit(WorkflowEvent.EVENT_TYPES.WORKFLOW_FAILED, {
        workflowId: context.id,
        payload: { error: err.message }
      });

      if (this.auditService) {
        await this.auditService.store.append({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          actor: 'workflow_executor',
          action: 'workflow_fail',
          resource: `workflow:${definition.id}`,
          workflowId: context.id,
          nodeId: null,
          decision: 'failed',
          metadata: { error: err.message, workerId: this.workerId }
        });
      }

      await this.compensationManager.compensateAll(context);
      await this.storage.saveWorkflow(context);

      workflowResult = {
        success: false,
        error: err.message || String(err),
        context: context.toJSON()
      };
    } finally {
      if (trace && this.diagnostics) {
        this.diagnostics.finalizeTrace(trace.id);
      }

      workflowResult = workflowResult || {
        success: false,
        error: 'Unknown error',
        context: context.toJSON()
      };

      workflowResult.duration = Date.now() - start;
      workflowResult.metrics = workflowResult.metrics || {};
      workflowResult.metrics.workflowDuration = Date.now() - start;
      workflowResult.metrics.nodesExecuted = workflowResult.metrics.nodesExecuted || 0;
      workflowResult.metrics.nodesFailed = workflowResult.metrics.nodesFailed || 0;
      workflowResult.metrics.retryCount = workflowResult.metrics.retryCount || 0;
      workflowResult.metrics.nodeExecutionCount = workflowResult.metrics.nodesExecuted;
      workflowResult._traceId = context.traceId;
      workflowResult._workflowId = context.id;
    }

    return workflowResult;
  }

  async resume(workflowId) {
    const start = Date.now();

    const context = await this.storage.loadWorkflow(workflowId);
    if (!context) {
      return { success: false, error: `Workflow "${workflowId}" not found`, metrics: { resumeDuration: 0 } };
    }

    if (context.status === WorkflowContext.STATUS.COMPLETED) {
      return {
        success: true,
        error: null,
        context: context.toJSON(),
        metrics: { resumeDuration: 0, idempotent: true }
      };
    }

    const definition = context.metadata.workflowDefinition;
    if (!definition) {
      return { success: false, error: `Workflow "${workflowId}" has no stored definition`, metrics: { resumeDuration: Date.now() - start } };
    }

    this._registerDefaults();

    if (context.status !== WorkflowContext.STATUS.RUNNING) {
      context.transitionTo(WorkflowContext.STATUS.RUNNING);
      context.incrementVersion();
      await this.storage.saveWorkflow(context);
    }

    const trace = this.diagnostics && typeof this.diagnostics.createPipelineTrace === 'function'
      ? this.diagnostics.createPipelineTrace(
          this.diagnostics.createTraceContext('workflow_resume')
        )
      : null;

    try {
      if (trace && this.diagnostics) {
        await this._diagnosticStep(trace, 'workflow_created', {
          workflowId: context.id,
          recoveryAttempt: true,
          traceId: context.traceId
        });
      }

      let workflowResult = await this._executeGraph(definition.graph, context, trace);

      if (workflowResult.success) {
        context.transitionTo(WorkflowContext.STATUS.COMPLETED);
        context.incrementVersion();
        this.eventBus.emit(WorkflowEvent.EVENT_TYPES.WORKFLOW_COMPLETED, {
          workflowId: context.id,
          payload: { recovered: true, nodesExecuted: workflowResult.metrics.nodesExecuted }
        });
      } else {
        context.transitionTo(WorkflowContext.STATUS.FAILED);
        context.incrementVersion();
        this.eventBus.emit(WorkflowEvent.EVENT_TYPES.WORKFLOW_FAILED, {
          workflowId: context.id,
          payload: { recovered: true, error: workflowResult.error }
        });
        const failedIds = (workflowResult.nodeResults
          ? Object.entries(workflowResult.nodeResults)
              .filter(([_, r]) => !r.success)
              .map(([id]) => id)
          : []);
        this.compensationManager.setFailedNodeIds(failedIds);
        await this.compensationManager.compensateAll(context);
      }

      await this.storage.saveWorkflow(context);

      workflowResult.resumed = true;
      workflowResult.metrics = workflowResult.metrics || {};
      workflowResult.metrics.resumeDuration = Date.now() - start;

      return workflowResult;
    } catch (err) {
      context.transitionTo(WorkflowContext.STATUS.FAILED);
      context.incrementVersion();

      if (trace && this.diagnostics) {
        await this._diagnosticStep(trace, 'workflow_failed', {
          error: err.message,
          recoveryAttempt: true
        });
      }

      await this.compensationManager.compensateAll(context);
      await this.storage.saveWorkflow(context);

      return {
        success: false,
        resumed: true,
        error: err.message || String(err),
        context: context.toJSON(),
        metrics: { resumeDuration: Date.now() - start }
      };
    } finally {
      if (trace && this.diagnostics) {
        this.diagnostics.finalizeTrace(trace.id);
      }
    }
  }

  async executeFork(parentContext, graph, overrides = {}) {
    const forked = parentContext.fork(overrides);
    forked.incrementVersion();
    await this.storage.saveWorkflow(forked);

    this._registerDefaults();

    this.eventBus.emit(WorkflowEvent.EVENT_TYPES.WORKFLOW_STARTED, {
      workflowId: forked.id,
      payload: { parentWorkflowId: parentContext.id, forked: true }
    });

    const result = await this._executeGraph(graph, forked, null);

    if (result.success) {
      forked.transitionTo(WorkflowContext.STATUS.COMPLETED);
      forked.incrementVersion();
    } else {
      forked.transitionTo(WorkflowContext.STATUS.FAILED);
      forked.incrementVersion();
    }

    await this.storage.saveWorkflow(forked);

    return { ...result, forkedId: forked.id, parentId: parentContext.id };
  }

  async _executeGraph(graph, context, trace) {
    const metrics = {
      nodesExecuted: 0,
      nodesFailed: 0,
      retryCount: 0
    };

    const validation = graph.validate();
    if (!validation.valid) {
      return { success: false, error: validation.errors.join('; '), metrics, context: context.toJSON() };
    }

    const sorted = graph.topologicalSort();
    const completed = new Set();
    const nodeResults = {};
    const pending = new Set(sorted);

    for (const id of sorted) {
      const state = await this.storage.getNodeState(context.id, id);
      if (state && state.status === 'completed') {
        completed.add(id);
        pending.delete(id);
        nodeResults[id] = state.result || { success: true, nodeId: id };
      }
    }

    while (pending.size > 0) {
      const readyNodes = graph.getReadyNodes(Array.from(completed), context);

      if (readyNodes.length === 0) {
        if (pending.size > 0) {
          return {
            success: false,
            error: `Deadlock detected: ${Array.from(pending).join(', ')} cannot be scheduled`,
            metrics,
            nodeResults,
            context: context.toJSON()
          };
        }
        break;
      }

      const snapshot = Array.from(pending);
      const results = await Promise.all(readyNodes.map(async (node) => {
        if (!pending.has(node.id)) return null;
        pending.delete(node.id);
        try {
          const result = await this._executeNode(node, context, trace, metrics);
          completed.add(node.id);
          nodeResults[node.id] = result;
          await this.storage.updateNodeState(context.id, node.id, {
            status: result.success ? 'completed' : 'failed',
            result
          });
          return result;
        } catch (err) {
          const failedResult = { success: false, nodeId: node.id, error: err.message || String(err) };
          completed.add(node.id);
          nodeResults[node.id] = failedResult;
          await this.storage.updateNodeState(context.id, node.id, {
            status: 'failed',
            result: failedResult
          });
          return failedResult;
        }
      }));

      const nonNull = results.filter(r => r !== null);
      const anyFailed = nonNull.some(r => !r.success);
      if (anyFailed) {
        const failedNodes = nonNull.filter(r => !r.success);
        return {
          success: false,
          error: `Nodes failed: ${failedNodes.map(r => r.nodeId).join(', ')}`,
          metrics,
          nodeResults,
          context: context.toJSON()
        };
      }
    }

    const allCompleted = sorted.every(id => completed.has(id));
    return {
      success: allCompleted,
      metrics,
      nodeResults,
      context: context.toJSON(),
      error: allCompleted ? null : `Not all nodes executed. Completed: ${completed.size}/${sorted.length}`
    };
  }

  async _executeNode(node, context, trace, metrics) {
    if (trace && this.diagnostics) {
      await this._diagnosticStep(trace, 'workflow_node_start', {
        nodeId: node.id,
        nodeType: node.type,
        workflowId: context.id,
        traceId: context.traceId
      });
    }

    this.eventBus.emit(WorkflowEvent.EVENT_TYPES.NODE_STARTED, {
      workflowId: context.id,
      nodeId: node.id,
      payload: { nodeType: node.type }
    });

    const handler = this.nodeRegistry.get(node.type);
    if (!handler) {
      const errMsg = `No handler registered for node type "${node.type}"`;
      this.eventBus.emit(WorkflowEvent.EVENT_TYPES.NODE_FAILED, {
        workflowId: context.id,
        nodeId: node.id,
        payload: { error: errMsg }
      });
      metrics.nodesFailed++;
      if (this.auditService) {
        await this.auditService.store.append({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          actor: 'workflow_executor',
          action: 'node_error',
          resource: `node:${node.type}`,
          workflowId: context.id,
          nodeId: node.id,
          decision: 'error',
          metadata: { error: errMsg, workerId: this.workerId }
        });
      }
      return { success: false, nodeId: node.id, error: errMsg };
    }

    const permission = this.nodeRegistry.checkPermission(node.type, { nodeId: node.id, workflowId: context.id }, context);
    if (!permission.allowed) {
      const errMsg = `Permission denied for node type "${node.type}": ${permission.reason || 'no permission'}`;
      this.eventBus.emit(WorkflowEvent.EVENT_TYPES.NODE_FAILED, {
        workflowId: context.id,
        nodeId: node.id,
        payload: { error: errMsg }
      });
      metrics.nodesFailed++;
      if (this.auditService) {
        await this.auditService.store.append({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          actor: 'workflow_executor',
          action: 'permission_deny',
          resource: `node:${node.type}`,
          workflowId: context.id,
          nodeId: node.id,
          decision: 'denied',
          metadata: { reason: permission.reason, workerId: this.workerId }
        });
      }
      return { success: false, nodeId: node.id, error: errMsg };
    }

    let attempt = 0;
    const policy = node.retryPolicy || this.retryPolicy;
    const executeFn = typeof handler === 'function' ? handler : handler.execute.bind(handler);
    const nodeTimeout = node.timeout || null;

    while (attempt < policy.maxAttempts) {
      try {
        let result;
        if (nodeTimeout) {
          result = await this._executeWithTimeout(executeFn, node, context, nodeTimeout);
        } else {
          result = await executeFn(node, context);
        }
        metrics.nodesExecuted++;

        if (trace && this.diagnostics) {
          await this._diagnosticStep(trace, 'workflow_node_complete', {
            nodeId: node.id,
            nodeType: node.type,
            workflowId: context.id,
            traceId: context.traceId,
            success: true
          });
        }

        this.eventBus.emit(WorkflowEvent.EVENT_TYPES.NODE_COMPLETED, {
          workflowId: context.id,
          nodeId: node.id,
          payload: { nodeType: node.type }
        });

        return { success: true, nodeId: node.id, data: result };
      } catch (err) {
        attempt++;
        metrics.retryCount++;

        if (policy.shouldRetry(attempt, err)) {
          this.eventBus.emit(WorkflowEvent.EVENT_TYPES.RETRY_STARTED, {
            workflowId: context.id,
            nodeId: node.id,
            payload: { attempt, maxAttempts: policy.maxAttempts, error: err.message }
          });

          if (!this.compensationManager.hasCompensation(node.id)) {
            this.compensationManager.registerCompensation(node.id, async () => {
              this.eventBus.emit(WorkflowEvent.EVENT_TYPES.COMPENSATION_STARTED, {
                workflowId: context.id,
                nodeId: node.id,
                payload: { reason: 'retry compensation', attempt }
              });
            });
          }

          continue;
        }

        metrics.nodesFailed++;

        if (trace && this.diagnostics) {
          await this._diagnosticStep(trace, 'workflow_node_complete', {
            nodeId: node.id,
            nodeType: node.type,
            workflowId: context.id,
            traceId: context.traceId,
            success: false,
            error: err.message
          });
        }

        this.eventBus.emit(WorkflowEvent.EVENT_TYPES.NODE_FAILED, {
          workflowId: context.id,
          nodeId: node.id,
          payload: { error: err.message, attempts: attempt }
        });

        return { success: false, nodeId: node.id, error: err.message || String(err) };
      }
    }

    metrics.nodesFailed++;
    return { success: false, nodeId: node.id, error: 'Max retry attempts exceeded' };
  }

  async _executeWithTimeout(fn, node, context, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Node "${node.id}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn(node, context).then((result) => {
        clearTimeout(timer);
        resolve(result);
      }).catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async _waitForApproval(approvalId) {
    if (!this.approvalService) {
      return false;
    }

    const timeoutMs = 30000;
    const pollInterval = 500;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const status = await this.approvalService.checkStatus(approvalId);
      if (status.status === 'approved') {
        if (this.auditService) {
          await this.auditService.store.append({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            actor: 'workflow_executor',
            action: 'approval_approved',
            resource: `approval:${approvalId}`,
            workflowId: null,
            nodeId: null,
            decision: 'approved',
            metadata: { approvalId, workerId: this.workerId }
          });
        }
        return true;
      }
      if (status.status === 'rejected' || status.status === 'cancelled') {
        if (this.auditService) {
          await this.auditService.store.append({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            actor: 'workflow_executor',
            action: 'approval_rejected',
            resource: `approval:${approvalId}`,
            workflowId: null,
            nodeId: null,
            decision: status.status,
            metadata: { approvalId, workerId: this.workerId }
          });
        }
        return false;
      }
      await new Promise(r => setTimeout(r, pollInterval));
    }

    if (this.auditService) {
      await this.auditService.store.append({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        actor: 'workflow_executor',
        action: 'approval_timeout',
        resource: `approval:${approvalId}`,
        workflowId: null,
        nodeId: null,
        decision: 'timeout',
        metadata: { approvalId, workerId: this.workerId }
      });
    }

    return false;
  }

  async _diagnosticStep(trace, stepType, metadata) {
    if (trace && this.diagnostics) {
      this.diagnostics.startPipelineStep(trace, stepType);
      this.diagnostics.finishPipelineStep(trace, stepType, metadata);
    }
  }
}

WorkflowExecutor.PIPELINE_STEPS = PIPELINE_STEPS;

module.exports = WorkflowExecutor;