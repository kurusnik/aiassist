const ToolValidator = require('./validators/ToolValidator');
const ToolDefinition = require('./ToolDefinition');

const ERROR_CODES = {
  DUPLICATE_ID: 'DUPLICATE_TOOL_ID',
  VALIDATION_FAILED: 'TOOL_VALIDATION_FAILED',
  NOT_FOUND: 'TOOL_NOT_FOUND'
};

class ToolRegistry {
  constructor(options = {}) {
    this._tools = new Map();
    this._validator = options.validator || new ToolValidator();
  }

  register(tool) {
    if (!(tool instanceof ToolDefinition)) {
      tool = new ToolDefinition(tool);
    }

    if (this._tools.has(tool.id)) {
      const err = new Error(`Tool "${tool.id}" is already registered`);
      err.code = ERROR_CODES.DUPLICATE_ID;
      throw err;
    }

    const validation = this._validator.validate(tool);
    if (!validation.valid) {
      const err = new Error(`Tool validation failed: ${validation.errors.join(', ')}`);
      err.code = ERROR_CODES.VALIDATION_FAILED;
      err.details = validation.errors;
      throw err;
    }

    this._tools.set(tool.id, tool);
    return tool;
  }

  get(id) {
    return this._tools.get(id) || null;
  }

  has(id) {
    return this._tools.has(id);
  }

  remove(id) {
    return this._tools.delete(id);
  }

  list() {
    return Array.from(this._tools.values());
  }

  clear() {
    this._tools.clear();
  }

  count() {
    return this._tools.size;
  }
}

ToolRegistry.ERROR_CODES = ERROR_CODES;

module.exports = ToolRegistry;