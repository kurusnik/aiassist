class ToolDefinition {
  constructor(options = {}) {
    this.id = options.id || null;
    this.name = options.name || '';
    this.description = options.description || '';
    this.inputSchema = options.inputSchema || null;
    this.outputSchema = options.outputSchema || null;
    this.permissions = options.permissions || null;
    this.provider = options.provider || null;
    this.metadata = options.metadata || {};
    this.version = options.version || '1.0';
    this.createdAt = options.createdAt || Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
      outputSchema: this.outputSchema,
      permissions: this.permissions,
      provider: this.provider,
      metadata: this.metadata,
      version: this.version,
      createdAt: this.createdAt
    };
  }
}

module.exports = ToolDefinition;