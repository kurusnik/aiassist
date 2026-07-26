class WorkflowQueue {
  async enqueue(workflowId) {
    throw new Error('Not implemented');
  }

  async dequeue(workerId) {
    throw new Error('Not implemented');
  }

  async ack(workflowId) {
    throw new Error('Not implemented');
  }

  async reject(workflowId) {
    throw new Error('Not implemented');
  }

  async peek() {
    throw new Error('Not implemented');
  }

  async count() {
    throw new Error('Not implemented');
  }

  async clear() {
    throw new Error('Not implemented');
  }
}

class InMemoryWorkflowQueue extends WorkflowQueue {
  constructor() {
    super();
    this._queue = [];
    this._inFlight = new Map();
    this._acknowledged = new Set();
  }

  async enqueue(workflowId) {
    if (this._queue.includes(workflowId)) return;
    if (this._acknowledged.has(workflowId)) return;
    this._queue.push(workflowId);
  }

  async dequeue(workerId) {
    if (this._queue.length === 0) return null;
    const workflowId = this._queue.shift();
    this._inFlight.set(workflowId, { workerId, dequeuedAt: Date.now() });
    return workflowId;
  }

  async ack(workflowId) {
    this._inFlight.delete(workflowId);
    this._acknowledged.add(workflowId);
  }

  async reject(workflowId) {
    this._inFlight.delete(workflowId);
    if (!this._acknowledged.has(workflowId) && !this._queue.includes(workflowId)) {
      this._queue.push(workflowId);
    }
  }

  async peek() {
    return this._queue.slice();
  }

  async count() {
    return this._queue.length;
  }

  async clear() {
    this._queue = [];
    this._inFlight.clear();
    this._acknowledged.clear();
  }
}

module.exports = { WorkflowQueue, InMemoryWorkflowQueue };