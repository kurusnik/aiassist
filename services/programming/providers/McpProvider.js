const BaseProvider = require('./BaseProvider');

class McpProvider extends BaseProvider {
  constructor() {
    super(
      'mcp',
      'Доступ к данным через MCP-протокол',
      ['collect_metadata']
    );
  }
}

module.exports = McpProvider;