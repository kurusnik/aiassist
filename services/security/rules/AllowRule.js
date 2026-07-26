const PermissionDecision = require('../models/PermissionDecision');

class AllowRule {
  constructor(options = {}) {
    this.name = options.name || 'AllowRule';
    this.description = options.description || 'Allows action if conditions match';
    this.conditions = options.conditions || {};
    this.priority = options.priority || 0;
  }

  evaluate(action, context) {
    const toolId = this._resolveToolId(action);
    const targetTools = this.conditions.targetTools || [];

    if (targetTools.length > 0 && toolId) {
      const matched = targetTools.some(t => toolId === t || toolId.startsWith(t));
      if (matched) {
        return { matched: true, reason: `Tool "${toolId}" allowed by AllowRule "${this.name}"` };
      }
    }

    const actionTypes = this.conditions.actionTypes || [];
    if (actionTypes.length > 0 && action && action.type) {
      if (actionTypes.includes(action.type)) {
        return { matched: true, reason: `Action type "${action.type}" allowed by AllowRule "${this.name}"` };
      }
    }

    const targets = this.conditions.targets || [];
    if (targets.length > 0 && action && action.target) {
      if (targets.includes(action.target)) {
        return { matched: true, reason: `Target "${action.target}" allowed by AllowRule "${this.name}"` };
      }
    }

    if (targetTools.length === 0 && actionTypes.length === 0 && targets.length === 0) {
      return { matched: true, reason: `AllowRule "${this.name}" — no conditions, allowed by default` };
    }

    return { matched: false, reason: null };
  }

  _resolveToolId(action) {
    if (!action || !action.parameters) return null;
    return action.parameters.toolId || action.parameters.tool || null;
  }
}

module.exports = AllowRule;