const BaseProvider = require('./BaseProvider');
const { connectionManager } = require('../../mcp');

class McpProvider extends BaseProvider {
  constructor() {
    super(
      'mcp',
      'Доступ к данным через MCP-протокол',
      ['collect_metadata']
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
        data: {
          available: false,
          metadata: {}
        }
      };
    }

    try {
      const metadata = await client.getMetadata();

      context.addLogEntry({
        step: step.action,
        provider: this.name,
        status: 'completed',
        message: 'Using MCP metadata'
      });

      return {
        success: true,
        provider: this.name,
        capability: step.action,
        message: 'Using MCP metadata',
        data: {
          available: true,
          metadata
        }
      };
    } catch (err) {
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
        data: {
          available: false,
          metadata: {}
        }
      };
    }
  }
}

module.exports = McpProvider;