const BaseProvider = require('./BaseProvider');
const { connectionManager } = require('../../mcp');

const ACTION_TO_MCP_TOOL = {
  collect_metadata: 'getMetadata',
  search_metadata: 'query',
  get_object_structure: 'get_structure',
  describe_metadata: 'describe'
};

const SUPPORTED_ACTIONS = Object.keys(ACTION_TO_MCP_TOOL);

class McpProvider extends BaseProvider {
  constructor() {
    super(
      'mcp',
      'Доступ к данным 1С через MCP-протокол',
      SUPPORTED_ACTIONS
    );
  }

  async execute(step, context) {
    const client = connectionManager.getClient();

    if (!client) {
      context.addLogEntry({
        step: step.action,
        provider: this.name,
        status: 'completed',
        message: 'MCP unavailable'
      });
      return {
        success: true,
        provider: this.name,
        capability: step.action,
        message: 'MCP unavailable',
        data: { available: false, metadata: {} }
      };
    }

    const mcpTool = ACTION_TO_MCP_TOOL[step.action];
    if (!mcpTool) {
      return {
        success: false,
        provider: this.name,
        capability: step.action,
        message: `No MCP tool mapping for action "${step.action}"`,
        data: { available: true, metadata: {} }
      };
    }

    try {
      const args = this._buildArgs(step, context);
      const result = await client.callTool(mcpTool, args);

      context.addLogEntry({
        step: step.action,
        provider: this.name,
        status: 'completed',
        message: `MCP ${mcpTool} completed`
      });

      const responseData = { available: true, metadata: result };

      context.mcpResults[step.action] = responseData;

      return {
        success: true,
        provider: this.name,
        capability: step.action,
        message: `MCP ${mcpTool} completed`,
        data: responseData
      };
    } catch (err) {
      context.addLogEntry({
        step: step.action,
        provider: this.name,
        status: 'failed',
        message: `MCP ${mcpTool} error: ${err.message}`
      });
      return {
        success: false,
        provider: this.name,
        capability: step.action,
        message: `MCP error: ${err.message}`,
        data: { available: false, metadata: {} }
      };
    }
  }

  _buildArgs(step, context) {
    if (step.action === 'search_metadata') {
      const requestText = context.userRequest || (context.task && context.task.originalRequest) || '';
      return { params: { query: requestText } };
    }
    if (step.action === 'get_object_structure') {
      const task = context.task || {};
      return { object: task.objectName || task.title || '' };
    }
    return {};
  }
}

module.exports = McpProvider;