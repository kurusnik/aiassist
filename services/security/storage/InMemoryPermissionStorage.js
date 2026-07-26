const PermissionStorage = require('./PermissionStorage');

class InMemoryPermissionStorage extends PermissionStorage {
  constructor() {
    super();
    this._policies = [];
    this._approvals = [];
  }

  async savePolicy(policy) {
    const idx = this._policies.findIndex(p => p.id === policy.id);
    if (idx >= 0) {
      this._policies[idx] = policy;
    } else {
      this._policies.push(policy);
    }
    return policy;
  }

  async loadPolicies() {
    return this._policies.slice();
  }

  async saveApproval(request) {
    const idx = this._approvals.findIndex(a => a.id === request.id);
    if (idx >= 0) {
      this._approvals[idx] = request;
    } else {
      this._approvals.push(request);
    }
    return request;
  }

  async loadApprovals(filters = {}) {
    let items = this._approvals.slice();
    if (filters.status) {
      items = items.filter(a => a.status === filters.status);
    }
    if (filters.tool) {
      items = items.filter(a => {
        const toolId = a.action && a.action.parameters
          ? (a.action.parameters.toolId || a.action.parameters.tool)
          : null;
        return toolId === filters.tool;
      });
    }
    return items;
  }

  clear() {
    this._policies = [];
    this._approvals = [];
  }
}

module.exports = InMemoryPermissionStorage;