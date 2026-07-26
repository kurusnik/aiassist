const AuditEvent = require('./AuditEvent');
const PostgresAuditStore = require('./PostgresAuditStore');

class AuditService {
  constructor(options = {}) {
    this.store = options.store || new PostgresAuditStore();
  }

  async recordPermissionDecision(action, context, decision) {
    const event = new AuditEvent({
      actor: context.actor || 'system',
      action: 'permission_evaluate',
      resource: action.type || 'unknown',
      workflowId: context.workflowId || null,
      nodeId: context.nodeId || null,
      decision: decision.allowed ? 'allowed' : (decision.requiresApproval ? 'approval_required' : 'denied'),
      metadata: {
        reason: decision.reason,
        policyId: decision.policyId,
        rulesApplied: decision.rulesApplied
      }
    });
    await this.store.append(event);
    return event;
  }

  async recordApprovalAction(request, user, action) {
    const event = new AuditEvent({
      actor: user || 'system',
      action: `approval_${action}`,
      resource: `approval:${request.id}`,
      workflowId: request.action ? request.action.workflowId : null,
      nodeId: request.action ? request.action.nodeId : null,
      decision: action,
      metadata: {
        approvalId: request.id,
        reason: request.rejectionReason || null,
        actionType: request.action ? request.action.type : null,
        expiresAt: request.expiresAt
      }
    });
    await this.store.append(event);
    return event;
  }

  async recordMCPExecution(action, context, result) {
    const event = new AuditEvent({
      actor: 'mcp_orchestrator',
      action: 'mcp_execute',
      resource: action.type || 'mcp',
      workflowId: context.workflowId || null,
      nodeId: context.nodeId || null,
      decision: result && result.success ? 'success' : 'failure',
      metadata: {
        parameters: action.parameters,
        error: result && result.error ? result.error : null
      }
    });
    await this.store.append(event);
    return event;
  }

  async recordToolExecution(toolName, parameters, result) {
    const event = new AuditEvent({
      actor: 'tool_registry',
      action: 'tool_execute',
      resource: `tool:${toolName}`,
      decision: result && result.success ? 'success' : 'failure',
      metadata: {
        parameters,
        error: result && result.error ? result.error : null
      }
    });
    await this.store.append(event);
    return event;
  }

  async recordAgentExecution(context, result) {
    const event = new AuditEvent({
      actor: 'agent_runtime',
      action: 'agent_execute',
      resource: 'agent',
      workflowId: context.workflowId || context.metadata ? context.metadata.workflowId : null,
      nodeId: context.metadata ? context.metadata.workflowNodeId : null,
      decision: result && result.success ? 'success' : 'failure',
      metadata: {
        error: result && result.errors ? result.errors : null
      }
    });
    await this.store.append(event);
    return event;
  }

  async query(filters) {
    return this.store.query(filters);
  }

  async getByWorkflow(workflowId) {
    return this.store.getByWorkflow(workflowId);
  }
}

module.exports = AuditService;