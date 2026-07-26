class AuditBuffer {
  constructor(options = {}) {
    this.store = options.store;
    this.flushIntervalMs = options.flushIntervalMs || 5000;
    this.batchSize = options.batchSize || 50;
    this._buffer = [];
    this._flushTimer = null;
    this._running = false;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._flushTimer = setInterval(() => {
      this.flush().catch(err => {
        console.error('[AuditBuffer] flush error:', err.message);
      });
    }, this.flushIntervalMs);
  }

  stop() {
    this._running = false;
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    return this.flush();
  }

  async append(event) {
    this._buffer.push(event);
    if (this._buffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  async flush() {
    if (this._buffer.length === 0) return;
    const batch = this._buffer.splice(0, this.batchSize);
    try {
      await Promise.all(batch.map(event => this.store.append(event)));
    } catch (err) {
      this._buffer.unshift(...batch);
      throw err;
    }
  }

  bufferSize() {
    return this._buffer.length;
  }
}

module.exports = AuditBuffer;