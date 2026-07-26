class ToolValidator {
  validate(tool) {
    const errors = [];

    if (!tool) {
      return { valid: false, errors: ['ToolDefinition is required'] };
    }

    if (!tool.id) {
      errors.push('ToolDefinition.id is required');
    }

    if (!tool.name) {
      errors.push('ToolDefinition.name is required');
    }

    if (!tool.provider) {
      errors.push('ToolDefinition.provider is required');
    }

    if (tool.inputSchema !== null && tool.inputSchema !== undefined) {
      if (typeof tool.inputSchema !== 'object' || Array.isArray(tool.inputSchema)) {
        errors.push('ToolDefinition.inputSchema must be an object or null');
      }
    }

    if (tool.outputSchema !== null && tool.outputSchema !== undefined) {
      if (typeof tool.outputSchema !== 'object' || Array.isArray(tool.outputSchema)) {
        errors.push('ToolDefinition.outputSchema must be an object or null');
      }
    }

    if (tool.permissions !== null && tool.permissions !== undefined) {
      if (typeof tool.permissions !== 'object' || Array.isArray(tool.permissions)) {
        errors.push('ToolDefinition.permissions must be an object or null');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = ToolValidator;