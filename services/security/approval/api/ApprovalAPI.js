const crypto = require('crypto');
const AuditService = require('../../../audit/AuditService');

class ApprovalAPI {
  constructor(options = {}) {
    this.approvalService = options.approvalService || null;
    this.auditService = options.auditService || new AuditService();
    this._authChecker = options.authChecker || null;
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

  async _ensureService() {
    if (!this.approvalService) {
      throw new Error('ApprovalService not configured');
    }
  }

  async listPending(params = {}) {
    const actor = params.actor || 'system';
    const auth = await this._checkAuth(actor, 'approval:list', 'approval');
    if (!auth) {
      return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    await this._ensureService();
    const store = this.approvalService.store;
    const filters = { status: 'pending' };
    if (params.workflowId) filters.workflowId = params.workflowId;
    if (params.riskLevel) filters.riskLevel = params.riskLevel;

    const requests = await store.list(filters);

    return {
      success: true,
      approvals: requests.map(r => this._toViewModel(r)),
      total: requests.length
    };
  }

  async getApproval(params = {}) {
    const actor = params.actor || 'system';
    const auth = await this._checkAuth(actor, 'approval:read', 'approval');
    if (!auth) {
      return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    await this._ensureService();
    const request = this.approvalService.store.get(params.id);
    if (!request) {
      return { success: false, error: `Approval "${params.id}" not found`, code: 'NOT_FOUND' };
    }

    return {
      success: true,
      approval: this._toViewModel(request)
    };
  }

  async approve(params = {}) {
    const actor = params.actor || 'system';
    const auth = await this._checkAuth(actor, 'approval:approve', 'approval');
    if (!auth) {
      return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    await this._ensureService();
    const { id, reason } = params;

    try {
      const result = await this.approvalService.approve(id, actor);

      await this._audit(
        actor,
        'approval:approve',
        `approval:${id}`,
        result.request ? result.request.action && result.request.action.workflowId : null,
        result.request ? result.request.action && result.request.action.nodeId : null,
        'approved',
        { approvalId: id, reason: reason || null }
      );

      return {
        success: true,
        approvalId: id,
        status: 'approved',
        approvedBy: actor,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        code: 'APPROVAL_ERROR'
      };
    }
  }

  async reject(params = {}) {
    const actor = params.actor || 'system';
    const auth = await this._checkAuth(actor, 'approval:reject', 'approval');
    if (!auth) {
      return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    await this._ensureService();
    const { id, reason } = params;

    try {
      const result = await this.approvalService.reject(id, actor, reason);

      await this._audit(
        actor,
        'approval:reject',
        `approval:${id}`,
        result.request ? result.request.action && result.request.action.workflowId : null,
        result.request ? result.request.action && result.request.action.nodeId : null,
        'rejected',
        { approvalId: id, reason: reason || null }
      );

      return {
        success: true,
        approvalId: id,
        status: 'rejected',
        rejectedBy: actor,
        rejectionReason: reason || null,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        code: 'APPROVAL_ERROR'
      };
    }
  }

  _toViewModel(request) {
    const action = request.action || {};
    return {
      id: request.id,
      workflowId: action.workflowId || null,
      nodeId: action.nodeId || null,
      tool: action.parameters ? (action.parameters.toolId || action.parameters.tool || null) : null,
      action: action.type || null,
      requestedAt: request.requestedAt ? new Date(request.requestedAt).toISOString() : null,
      expiresAt: request.expiresAt ? new Date(request.expiresAt).toISOString() : null,
      reason: request.rejectionReason || null,
      riskLevel: request.permissionDecision ? (request.permissionDecision.rulesApplied || []).find(r => r.riskLevel) || 'medium' : 'medium',
      requestedBy: request.agentContext ? (request.agentContext.actor || request.agentContext.userId || 'system') : 'system',
      status: request.status,
      approvedBy: request.approvedBy || null,
      approvedAt: request.approvedAt ? new Date(request.approvedAt).toISOString() : null,
      rejectedBy: request.rejectedBy || null,
      rejectedAt: request.rejectedAt ? new Date(request.rejectedAt).toISOString() : null
    };
  }
}

module.exports = ApprovalAPI;