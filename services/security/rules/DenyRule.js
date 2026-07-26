const PermissionDecision = require('../models/PermissionDecision');

class DenyRule {
  constructor(options = {}) {
    this.name = options.name || 'DenyRule';
    this.description = options.description || 'Denies action if conditions match';
    this.conditions = options.conditions || {};
    this.priority = options.priority || 0;
  }

  evaluate(action, context) {
    const toolId = this._resolveToolId(action);
    const targetTools = this.conditions.targetTools || [];

    if (targetTools.length > 0 && toolId) {
      const matched = targetTools.some(t => toolId === t || toolId.startsWith(t));
      if (matched) {
        return { matched: true, reason: `Tool "${toolId}" denied by DenyRule "${this.name}"` };
      }
    }

    const actionTypes = this.conditions.actionTypes || [];
    if (actionTypes.length > 0 && action && action.type) {
      if (actionTypes.includes(action.type)) {
        return { matched: true, reason: `Action type "${action.type}" denied by DenyRule "${this.name}"` };
      }
    }

    const targets = this.conditions.targets || [];
    if (targets.length > 0 && action && action.target) {
      if (targets.includes(action.target)) {
        return { matched: true, reason: `Target "${action.target}" denied by DenyRule "${this.name}"` };
      }
    }

    return { matched: false, reason: null };
  }

  _resolveToolId(action) {
    if (!action || !action.parameters) return null;
    return action.parameters.toolId || action.parameters.tool || null;
  }
}

module.exports = DenyRule;