class MCPExecutionContext {
  constructor(options = {}) {
    this.traceId = options.traceId || null;
    this.action = options.action || null;
    this.toolDefinition = options.toolDefinition || null;
    this.parameters = options.parameters || {};
    this.agentContext = options.agentContext || null;
    this.metadata = options.metadata || {};
    this.timeout = options.timeout || 30000;
    this.retryCount = options.retryCount || 0;
    this.maxRetries = options.maxRetries || 3;
  }

  clone() {
    return new MCPExecutionContext({
      traceId: this.traceId,
      action: this.action ? { ...this.action } : null,
      toolDefinition: this.toolDefinition,
      parameters: { ...this.parameters },
      agentContext: this.agentContext,
      metadata: { ...this.metadata },
      timeout: this.timeout,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries
    });
  }

  shouldRetry() {
    return this.retryCount < this.maxRetries;
  }

  incrementRetry() {
    this.retryCount += 1;
  }

  toJSON() {
    return {
      traceId: this.traceId,
      action: this.action,
      toolDefinition: this.toolDefinition ? this.toolDefinition.toJSON() : null,
      parameters: this.parameters,
      agentContext: this.agentContext ? {
        traceId: this.agentContext.traceId
      } : null,
      metadata: this.metadata,
      timeout: this.timeout,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries
    };
  }
}

module.exports = MCPExecutionContext;