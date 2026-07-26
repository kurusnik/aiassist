class PermissionStorage {
  async savePolicy(policy) {
    throw new Error('Not implemented');
  }

  async loadPolicies() {
    throw new Error('Not implemented');
  }

  async saveApproval(request) {
    throw new Error('Not implemented');
  }

  async loadApprovals(filters) {
    throw new Error('Not implemented');
  }
}

module.exports = PermissionStorage;