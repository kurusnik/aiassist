class EventStore {
  async append(event) {
    throw new Error('Not implemented');
  }

  async getHistory(workflowId) {
    throw new Error('Not implemented');
  }

  async replay(workflowId, handler) {
    throw new Error('Not implemented');
  }

  async replayFrom(workflowId, fromSequence, handler) {
    throw new Error('Not implemented');
  }

  async getLastSequence(workflowId) {
    throw new Error('Not implemented');
  }

  async getAll(limit, offset) {
    throw new Error('Not implemented');
  }

  async count() {
    throw new Error('Not implemented');
  }

  async clear() {
    throw new Error('Not implemented');
  }
}

module.exports = EventStore;