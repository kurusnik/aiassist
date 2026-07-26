class AgentRegistry {
  constructor() {
    this._registry = new Map();
  }

  register(type, handler) {
    if (!type || typeof type !== 'string') {
      throw new Error('AgentRegistry.register requires a string type');
    }
    if (typeof handler !== 'function' && typeof handler.execute !== 'function') {
      throw new Error('AgentRegistry.register requires a handler with execute() method');
    }
    if (this._registry.has(type)) {
      throw new Error(`Agent type "${type}" is already registered`);
    }
    this._registry.set(type, handler);
  }

  get(type) {
    return this._registry.get(type) || null;
  }

  remove(type) {
    this._registry.delete(type);
  }

  has(type) {
    return this._registry.has(type);
  }

  list() {
    return Array.from(this._registry.entries()).map(([type, handler]) => ({
      type,
      name: handler.runtime ? handler.runtime.name : (handler.name || type),
      version: handler.runtime ? handler.runtime.version : 'unknown'
    }));
  }

  count() {
    return this._registry.size;
  }

  clear() {
    this._registry.clear();
  }
}

module.exports = AgentRegistry;