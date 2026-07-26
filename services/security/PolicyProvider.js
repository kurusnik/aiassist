const PermissionDecision = require('./models/PermissionDecision');

class PolicyProvider {
  constructor(options = {}) {
    this.policyStore = options.policyStore || null;
    this.defaultDecision = options.defaultDecision || PermissionDecision.allow('No policies applied');
  }

  async evaluate(action, context) {
    if (!this.policyStore) {
      return this.defaultDecision;
    }

    const policies = this.policyStore.list().filter(p => p.enabled !== false);
    if (policies.length === 0) {
      return this.defaultDecision;
    }

    let finalDecision = null;
    let allRulesApplied = [];
    let matchedPolicy = null;

    for (const policy of policies) {
      if (!policy.rules || policy.rules.length === 0) continue;

      for (const rule of policy.rules) {
        if (typeof rule.evaluate !== 'function') continue;

        const result = rule.evaluate(action, context);
        if (result.matched) {
          allRulesApplied.push({
            rule: rule.name || 'unnamed',
            policy: policy.id,
            reason: result.reason
          });

          matchedPolicy = matchedPolicy || policy;

          if (rule instanceof (require('./rules/DenyRule'))) {
            finalDecision = PermissionDecision.deny(
              result.reason,
              policy.id,
              allRulesApplied
            );
            return finalDecision;
          }

          if (rule instanceof (require('./rules/ConfirmationRequiredRule'))) {
            finalDecision = PermissionDecision.approvalRequired(
              result.reason,
              policy.id,
              allRulesApplied
            );
          }
        }
      }
    }

    if (finalDecision) {
      return finalDecision;
    }

    return PermissionDecision.allow(
      matchedPolicy ? 'Allowed by policy' : 'No restrictive rules matched',
      matchedPolicy ? matchedPolicy.id : null,
      allRulesApplied
    );
  }
}

module.exports = PolicyProvider;