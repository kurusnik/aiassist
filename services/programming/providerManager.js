class ProviderManager {
  constructor() {
    this._providers = new Map();
  }

  register(provider) {
    if (!provider || !provider.name) {
      throw new Error('Provider must have a name');
    }
    this._providers.set(provider.name, provider);
  }

  get(name) {
    return this._providers.get(name) || null;
  }

  list() {
    return Array.from(this._providers.values()).map(p => ({
      name: p.name,
      description: p.description,
      capabilities: p.capabilities,
      enabled: p.enabled
    }));
  }
}

module.exports = ProviderManager;