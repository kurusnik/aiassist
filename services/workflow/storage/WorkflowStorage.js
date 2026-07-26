class WorkflowStorage {
  async saveWorkflow(context) {
    throw new Error('Not implemented');
  }

  async loadWorkflow(workflowId) {
    throw new Error('Not implemented');
  }

  async saveWorkflowNodeState(workflowId, nodeId, state) {
    throw new Error('Not implemented');
  }

  async updateNodeState(workflowId, nodeId, state) {
    throw new Error('Not implemented');
  }

  async getNodeState(workflowId, nodeId) {
    throw new Error('Not implemented');
  }

  async listRunning() {
    throw new Error('Not implemented');
  }

  async removeWorkflow(workflowId) {
    throw new Error('Not implemented');
  }

  async heartbeat(workflowId, workerId, ttlMs) {
    throw new Error('Not implemented');
  }

  async acquireLease(workflowId, workerId, ttlMs) {
    throw new Error('Not implemented');
  }

  async releaseLease(workflowId, workerId) {
    throw new Error('Not implemented');
  }

  async renewLease(workflowId, workerId, ttlMs) {
    throw new Error('Not implemented');
  }

  async listStuckWorkflows(maxAgeMs) {
    throw new Error('Not implemented');
  }

  async count() {
    throw new Error('Not implemented');
  }

  async clear() {
    throw new Error('Not implemented');
  }
}

module.exports = WorkflowStorage;