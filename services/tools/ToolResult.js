class ToolResult {
  constructor(options = {}) {
    this.success = options.success || false;
    this.data = options.data || null;
    this.error = options.error || null;
    this.duration = options.duration || 0;
    this.metrics = options.metrics || null;
  }

  static success(data, duration = 0, metrics = null) {
    return new ToolResult({
      success: true,
      data,
      error: null,
      duration,
      metrics
    });
  }

  static failure(code, message, duration = 0, details = null) {
    const error = { code, message };
    if (details) {
      error.details = details;
    }
    return new ToolResult({
      success: false,
      data: null,
      error,
      duration,
      metrics: null
    });
  }

  toJSON() {
    return {
      success: this.success,
      data: this.data,
      error: this.error,
      duration: this.duration,
      metrics: this.metrics
    };
  }
}

module.exports = ToolResult;