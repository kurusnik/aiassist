const WorkflowEvent = require('./WorkflowEvent');

class WorkflowEventBus {
  constructor(options = {}) {
    this._subscribers = new Map();
    this._history = [];
    this._maxHistory = options.maxHistory || 1000;
  }

  async emit(typeOrEvent, eventData = {}) {
    let event;
    if (typeOrEvent instanceof WorkflowEvent) {
      event = typeOrEvent;
    } else {
      event = new WorkflowEvent({ type: typeOrEvent, ...eventData });
    }

    this._history.push(event);
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }

    const handlers = this._subscribers.get(event.type) || [];
    for (const handler of handlers) {
      try {
        const result = handler(event);
        if (result && typeof result.then === 'function') {
          await result;
        }
      } catch (err) {
        // subscriber errors must never break the bus
      }
    }

    const wildcardHandlers = this._subscribers.get('*') || [];
    for (const handler of wildcardHandlers) {
      try {
        const result = handler(event);
        if (result && typeof result.then === 'function') {
          await result;
        }
      } catch (err) {
        // subscriber errors must never break the bus
      }
    }

    return event;
  }

  subscribe(type, handler) {
    if (!this._subscribers.has(type)) {
      this._subscribers.set(type, []);
    }
    this._subscribers.get(type).push(handler);
    return () => this.unsubscribe(type, handler);
  }

  unsubscribe(type, handler) {
    const handlers = this._subscribers.get(type);
    if (!handlers) return false;
    const index = handlers.indexOf(handler);
    if (index === -1) return false;
    handlers.splice(index, 1);
    if (handlers.length === 0) {
      this._subscribers.delete(type);
    }
    return true;
  }

  replay(type, handler) {
    const filtered = type
      ? this._history.filter(e => e.type === type)
      : this._history.slice();
    for (const event of filtered) {
      handler(event);
    }
    return filtered.length;
  }

  getHistory(type) {
    if (type) {
      return this._history.filter(e => e.type === type);
    }
    return this._history.slice();
  }

  clear() {
    this._subscribers.clear();
    this._history = [];
  }

  clearHistory() {
    this._history = [];
  }

  subscriberCount(type) {
    if (type) {
      return (this._subscribers.get(type) || []).length;
    }
    let count = 0;
    for (const handlers of this._subscribers.values()) {
      count += handlers.length;
    }
    return count;
  }
}

module.exports = WorkflowEventBus;