class AuditStore {
  async append(event) {
    throw new Error('Not implemented');
  }

  async getByWorkflow(workflowId) {
    throw new Error('Not implemented');
  }

  async getByActor(actor) {
    throw new Error('Not implemented');
  }

  async getByAction(action) {
    throw new Error('Not implemented');
  }

  async query(filters) {
    throw new Error('Not implemented');
  }

  async count() {
    throw new Error('Not implemented');
  }

  async clear() {
    throw new Error('Not implemented');
  }
}

module.exports = AuditStore;