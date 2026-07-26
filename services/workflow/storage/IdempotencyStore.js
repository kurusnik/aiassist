class IdempotencyStore {
  async check(key) {
    throw new Error('Not implemented');
  }

  async store(key, workflowId, ttlMs) {
    throw new Error('Not implemented');
  }

  async removeExpired() {
    throw new Error('Not implemented');
  }

  async clear() {
    throw new Error('Not implemented');
  }
}

module.exports = IdempotencyStore;