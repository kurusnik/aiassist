const crypto = require('crypto');

const STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
};

class ApprovalRequest {
  constructor(options = {}) {
    this.id = options.id || crypto.randomUUID();
    this.action = options.action || null;
    this.toolDefinition = options.toolDefinition || null;
    this.agentContext = options.agentContext || null;
    this.permissionDecision = options.permissionDecision || null;
    this.status = options.status || STATUS.PENDING;
    this.requestedAt = options.requestedAt || Date.now();
    this.expiresAt = options.expiresAt || null;
    this.approvedAt = options.approvedAt || null;
    this.rejectedAt = options.rejectedAt || null;
    this.approvedBy = options.approvedBy || null;
    this.rejectionReason = options.rejectionReason || null;
  }

  approve(user) {
    if (this.status !== STATUS.PENDING) {
      throw new Error(`Cannot approve request "${this.id}": status is ${this.status}`);
    }
    this.status = STATUS.APPROVED;
    this.approvedAt = Date.now();
    this.approvedBy = user;
  }

  reject(user, reason) {
    if (this.status !== STATUS.PENDING) {
      throw new Error(`Cannot reject request "${this.id}": status is ${this.status}`);
    }
    this.status = STATUS.REJECTED;
    this.rejectedAt = Date.now();
    this.approvedBy = null;
    this.rejectionReason = reason || 'Rejected by user';
  }

  expire() {
    if (this.status !== STATUS.PENDING) {
      return;
    }
    this.status = STATUS.EXPIRED;
  }

  cancel() {
    if (this.status !== STATUS.PENDING) {
      throw new Error(`Cannot cancel request "${this.id}": status is ${this.status}`);
    }
    this.status = STATUS.CANCELLED;
  }

  isExpired() {
    if (this.status !== STATUS.PENDING) return false;
    if (!this.expiresAt) return false;
    return Date.now() >= this.expiresAt;
  }

  toJSON() {
    return {
      id: this.id,
      action: this.action,
      toolDefinition: this.toolDefinition ? this.toolDefinition.toJSON() : null,
      agentContext: this.agentContext ? { traceId: this.agentContext.traceId } : null,
      permissionDecision: this.permissionDecision ? this.permissionDecision.toJSON() : null,
      status: this.status,
      requestedAt: this.requestedAt ? new Date(this.requestedAt).toISOString() : null,
      expiresAt: this.expiresAt ? new Date(this.expiresAt).toISOString() : null,
      approvedAt: this.approvedAt ? new Date(this.approvedAt).toISOString() : null,
      rejectedAt: this.rejectedAt ? new Date(this.rejectedAt).toISOString() : null,
      approvedBy: this.approvedBy,
      rejectionReason: this.rejectionReason
    };
  }
}

ApprovalRequest.STATUS = STATUS;

module.exports = ApprovalRequest;