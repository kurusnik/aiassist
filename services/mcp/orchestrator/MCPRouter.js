class MCPRouter {
  constructor(options = {}) {
    this._providers = new Map();
  }

  registerProvider(name, provider) {
    if (this._providers.has(name)) {
      throw new Error(`Provider "${name}" is already registered`);
    }
    this._providers.set(name, provider);
  }

  resolve(toolDefinition) {
    const providerName = toolDefinition.provider;
    const provider = this._providers.get(providerName);
    return provider || null;
  }

  listProviders() {
    return Array.from(this._providers.keys());
  }

  hasProvider(name) {
    return this._providers.has(name);
  }

  removeProvider(name) {
    return this._providers.delete(name);
  }
}

module.exports = MCPRouter;