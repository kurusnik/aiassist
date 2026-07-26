const ApprovalRequest = require('./ApprovalRequest');
const ApprovalStore = require('./ApprovalStore');

class ApprovalService {
  constructor(options = {}) {
    this.store = options.store || new ApprovalStore();
    this.defaultExpirationMs = options.defaultExpirationMs || 5 * 60 * 1000;
  }

  async requestApproval(action, context, permissionDecision) {
    const request = this.store.create({
      action,
      toolDefinition: context ? context.toolDefinition || null : null,
      agentContext: context ? context.agentContext || null : null,
      permissionDecision,
      status: ApprovalRequest.STATUS.PENDING,
      expiresAt: Date.now() + this.defaultExpirationMs
    });

    return {
      status: ApprovalRequest.STATUS.PENDING,
      approvalId: request.id,
      request: request.toJSON()
    };
  }

  async approve(requestId, user) {
    const request = this.store.get(requestId);
    if (!request) {
      throw new Error(`ApprovalRequest "${requestId}" not found`);
    }
    request.approve(user);
    return {
      status: ApprovalRequest.STATUS.APPROVED,
      approvalId: request.id,
      approvedBy: user,
      approvedAt: request.approvedAt
    };
  }

  async reject(requestId, user, reason) {
    const request = this.store.get(requestId);
    if (!request) {
      throw new Error(`ApprovalRequest "${requestId}" not found`);
    }
    request.reject(user, reason);
    return {
      status: ApprovalRequest.STATUS.REJECTED,
      approvalId: request.id,
      rejectedBy: user,
      rejectionReason: reason
    };
  }

  async checkStatus(requestId) {
    const request = this.store.get(requestId);
    if (!request) {
      return { status: 'not_found', approvalId: requestId };
    }

    if (request.isExpired()) {
      request.expire();
    }

    return {
      status: request.status,
      approvalId: request.id,
      approvedBy: request.approvedBy,
      approvedAt: request.approvedAt ? new Date(request.approvedAt).toISOString() : null,
      rejectedAt: request.rejectedAt ? new Date(request.rejectedAt).toISOString() : null,
      rejectionReason: request.rejectionReason
    };
  }
}

ApprovalService.DEFAULT_EXPIRATION_MS = 5 * 60 * 1000;

module.exports = ApprovalService;