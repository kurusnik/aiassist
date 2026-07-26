const ApprovalRequest = require('./ApprovalRequest');

class ApprovalStore {
  constructor() {
    this._requests = new Map();
  }

  create(data) {
    const request = data instanceof ApprovalRequest
      ? data
      : new ApprovalRequest(data);

    if (this._requests.has(request.id)) {
      throw new Error(`ApprovalRequest "${request.id}" already exists`);
    }

    this._requests.set(request.id, request);
    return request;
  }

  get(id) {
    return this._requests.get(id) || null;
  }

  list(filters = {}) {
    let items = Array.from(this._requests.values());

    if (filters.status) {
      items = items.filter(r => r.status === filters.status);
    }

    if (filters.tool) {
      items = items.filter(r => {
        if (!r.action || !r.action.parameters) return false;
        const toolId = r.action.parameters.toolId || r.action.parameters.tool;
        return toolId === filters.tool;
      });
    }

    if (filters.workflowId) {
      items = items.filter(r => {
        if (!r.action) return false;
        return r.action.workflowId === filters.workflowId;
      });
    }

    if (filters.createdAfter) {
      const after = new Date(filters.createdAfter).getTime();
      items = items.filter(r => r.requestedAt >= after);
    }

    return items.sort((a, b) => b.requestedAt - a.requestedAt);
  }

  approve(id, user) {
    const request = this.get(id);
    if (!request) {
      throw new Error(`ApprovalRequest "${id}" not found`);
    }
    request.approve(user);
    return request;
  }

  reject(id, user, reason) {
    const request = this.get(id);
    if (!request) {
      throw new Error(`ApprovalRequest "${id}" not found`);
    }
    request.reject(user, reason);
    return request;
  }

  expire(id) {
    const request = this.get(id);
    if (!request) return null;
    request.expire();
    return request;
  }

  remove(id) {
    return this._requests.delete(id);
  }

  clear() {
    this._requests.clear();
  }

  count() {
    return this._requests.size;
  }

  expirePending() {
    let expired = 0;
    for (const request of this._requests.values()) {
      if (request.status === ApprovalRequest.STATUS.PENDING && request.isExpired()) {
        request.expire();
        expired++;
      }
    }
    return expired;
  }
}

module.exports = ApprovalStore;