const PolicyProvider = require('./PolicyProvider');

const SAFETY_LEVELS = {
  NONE: 'none',
  OBSERVE: 'observe',
  CONFIRM: 'confirm',
  ESCALATE: 'escalate'
};

class SafetyChecker {
  constructor(options = {}) {
    this.permittedActions = options.permittedActions || [];
    this.confirmationRequired = options.confirmationRequired || [];
    this.policyProvider = options.policyProvider || null;
  }

  setPolicyProvider(provider) {
    this.policyProvider = provider;
  }

  async check(action) {
    if (this.policyProvider) {
      return this.policyProvider.evaluate(action, null);
    }

    if (!action) {
      return {
        allowed: true,
        requiresConfirmation: false,
        reason: null
      };
    }

    const actionType = action.type || action;

    if (this.confirmationRequired.includes(actionType)) {
      return {
        allowed: true,
        requiresConfirmation: true,
        reason: `Action "${actionType}" requires user confirmation`
      };
    }

    return {
      allowed: true,
      requiresConfirmation: false,
      reason: null
    };
  }

  async checkContext(agentContext) {
    if (this.policyProvider) {
      return this.policyProvider.evaluate(null, agentContext);
    }

    const planningContext = agentContext.planningContext;
    if (!planningContext) {
      return { allowed: true, requiresConfirmation: false, reason: null };
    }

    const safety = planningContext.safety || {};
    const actions = planningContext.actions || [];

    if (safety.requiresConfirmation || safety.requiresPermission) {
      return {
        allowed: true,
        requiresConfirmation: true,
        reason: 'Planning context flags require user confirmation'
      };
    }

    for (const action of actions) {
      if (action.safety) {
        if (action.safety.requiresConfirmation || action.safety.requiresPermission) {
          return {
            allowed: true,
            requiresConfirmation: true,
            reason: `Action "${action.type}:${action.target}" requires confirmation`
          };
        }
      }
    }

    return {
      allowed: true,
      requiresConfirmation: false,
      reason: null
    };
  }
}

SafetyChecker.SAFETY_LEVELS = SAFETY_LEVELS;

module.exports = SafetyChecker;