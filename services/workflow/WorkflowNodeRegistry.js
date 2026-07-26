class WorkflowNodeRegistry {
  constructor() {
    this._handlers = new Map();
    this._hooks = new Map();
    this._permissions = new Map();
    this._versions = new Map();
  }

  register(type, handler, options = {}) {
    if (this._handlers.has(type)) {
      throw new Error(`Handler for type "${type}" is already registered`);
    }
    if (typeof handler !== 'function' && typeof handler.execute !== 'function') {
      throw new Error(`Handler for type "${type}" must be a function or have an execute() method`);
    }
    this._handlers.set(type, handler);
    this._versions.set(type, options.version || 1);

    if (options.permissions) {
      this._permissions.set(type, options.permissions);
    }
  }

  get(type) {
    return this._handlers.get(type) || null;
  }

  has(type) {
    return this._handlers.has(type);
  }

  remove(type) {
    this._handlers.delete(type);
    this._hooks.delete(type);
    this._permissions.delete(type);
    this._versions.delete(type);
  }

  replace(type, handler, options = {}) {
    const currentVersion = this._versions.get(type) || 0;
    this._handlers.set(type, handler);
    this._versions.set(type, currentVersion + 1);

    if (options.permissions !== undefined) {
      this._permissions.set(type, options.permissions);
    }

    return { type, previousVersion: currentVersion, newVersion: currentVersion + 1 };
  }

  list() {
    return Array.from(this._handlers.keys()).map(type => ({
      type,
      version: this._versions.get(type) || 1,
      hasPermission: this._permissions.has(type)
    }));
  }

  getVersion(type) {
    return this._versions.get(type) || null;
  }

  setHooks(type, hooks) {
    this._hooks.set(type, hooks);
  }

  getHooks(type) {
    return this._hooks.get(type) || null;
  }

  getPermission(type) {
    return this._permissions.get(type) || null;
  }

  checkPermission(type, action, context) {
    const permission = this._permissions.get(type);
    if (!permission) return { allowed: true };
    if (typeof permission === 'function') {
      return { allowed: permission(action, context) };
    }
    return { allowed: true };
  }

  count() {
    return this._handlers.size;
  }

  clear() {
    this._handlers.clear();
    this._hooks.clear();
    this._permissions.clear();
    this._versions.clear();
  }
}

module.exports = WorkflowNodeRegistry;