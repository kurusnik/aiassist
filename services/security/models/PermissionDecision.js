// services/security/models/PermissionDecision.js
// Решение о разрешении доступа к действию (value object, иммутабельный контракт).
// Sprint 3 ссылался на этот модуль из PolicyProvider/rules/MCPOrchestrator/
// WorkflowExecutor, но сам файл не был добавлен в коммит — прод падал на старте.
// Контракт восстановлен по реальным usage-сайтам:
//   PermissionDecision.allow(reason, policyId, rulesApplied)
//   PermissionDecision.deny(reason, policyId, rulesApplied)
//   PermissionDecision.approvalRequired(reason, policyId, rulesApplied)
//   new PermissionDecision({ allowed, reason, requiresApproval, policyId, rulesApplied })
//   decision.{ allowed, reason, requiresApproval, policyId, rulesApplied }
//   decision instanceof PermissionDecision

class PermissionDecision {
  constructor({
    allowed = false,
    reason = null,
    requiresApproval = false,
    policyId = null,
    rulesApplied = []
  } = {}) {
    this.allowed = allowed;
    this.reason = reason;
    this.requiresApproval = requiresApproval;
    this.policyId = policyId;
    this.rulesApplied = Array.isArray(rulesApplied) ? rulesApplied : [];
  }

  static allow(reason = 'Allowed', policyId = null, rulesApplied = []) {
    return new PermissionDecision({ allowed: true, reason, policyId, rulesApplied });
  }

  static deny(reason = 'Denied', policyId = null, rulesApplied = []) {
    return new PermissionDecision({ allowed: false, reason, policyId, rulesApplied });
  }

  static approvalRequired(reason = 'Approval required', policyId = null, rulesApplied = []) {
    return new PermissionDecision({
      allowed: false,
      reason,
      requiresApproval: true,
      policyId,
      rulesApplied
    });
  }

  toJSON() {
    return {
      allowed: this.allowed,
      reason: this.reason,
      requiresApproval: this.requiresApproval,
      policyId: this.policyId,
      rulesApplied: this.rulesApplied
    };
  }
}

module.exports = PermissionDecision;
module.exports.default = PermissionDecision;