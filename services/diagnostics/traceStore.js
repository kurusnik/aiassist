const MAX_TRACES = 500;

class TraceStore {
  constructor() {
    this._traces = [];
    this._tracesById = new Map();
  }

  store(trace) {
    if (this._traces.length >= MAX_TRACES) {
      const removed = this._traces.shift();
      this._tracesById.delete(removed.id);
    }
    this._traces.push(trace);
    this._tracesById.set(trace.id, trace);
    return trace;
  }

  getById(id) {
    return this._tracesById.get(id) || null;
  }

  list(limit = 50, offset = 0) {
    const slice = this._traces.slice(-(offset + limit), this._traces.length - offset);
    return slice.reverse();
  }

  count() {
    return this._traces.length;
  }

  clear() {
    this._traces = [];
    this._tracesById.clear();
  }
}

module.exports = new TraceStore();