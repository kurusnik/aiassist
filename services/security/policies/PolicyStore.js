class PolicyStore {
  constructor() {
    this._policies = new Map();
  }

  register(policy) {
    if (!policy || !policy.id) {
      throw new Error('Policy must have an id');
    }

    if (this._policies.has(policy.id)) {
      throw new Error(`Policy "${policy.id}" is already registered`);
    }

    const normalized = {
      id: policy.id,
      name: policy.name || '',
      description: policy.description || '',
      rules: policy.rules || [],
      enabled: policy.enabled !== false,
      priority: policy.priority || 0,
      createdAt: policy.createdAt || Date.now()
    };

    this._policies.set(policy.id, normalized);
    return normalized;
  }

  get(policyId) {
    return this._policies.get(policyId) || null;
  }

  list() {
    return Array.from(this._policies.values()).sort((a, b) => b.priority - a.priority);
  }

  remove(policyId) {
    return this._policies.delete(policyId);
  }

  clear() {
    this._policies.clear();
  }

  count() {
    return this._policies.size;
  }
}

module.exports = PolicyStore;