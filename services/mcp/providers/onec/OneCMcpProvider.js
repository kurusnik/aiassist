const { onecConnectionManager } = require('../../index');

class OneCMcpProvider {
  constructor(options = {}) {
    this._connectionManager = options.connectionManager || onecConnectionManager;
    this._baseUrl = options.baseUrl || process.env.ONEC_MCP_URL || '';
    this._login = options.login || process.env.ONEC_MCP_LOGIN || '';
    this._password = options.password || process.env.ONEC_MCP_PASSWORD || '';
  }

  _getClient() {
    return this._connectionManager.getClient();
  }

  async _callTool(tool, args = {}) {
    const client = this._getClient();
    if (!client) {
      return { success: false, error: 'MCP is not connected' };
    }
    console.log(`[OneCMcpProvider] Calling tool: ${tool}`);
    try {
      const result = await client.callTool(tool, args);
      console.log(`[OneCMcpProvider] Tool ${tool} completed`);
      return { success: true, data: result };
    } catch (err) {
      console.error(`[OneCMcpProvider] Error calling tool "${tool}":`, err.message);
      return { success: false, error: err.message, details: err };
    }
  }

  async ping() {
    return this._callTool('ping');
  }

  async config() {
    return this._callTool('config');
  }

  async describe(name) {
    return this._callTool('describe', { name });
  }

  async getStructure(name) {
    return this._callTool('get_structure', { name });
  }

  async query(text) {
    return this._callTool('query', { text });
  }

  async executeQuery(text) {
    return this._callTool('execute_query', { text });
  }

  async help() {
    return this._callTool('help');
  }
}

module.exports = OneCMcpProvider;