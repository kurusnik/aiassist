const config = require('../config');
const McpConnectionManager = require('../McpConnectionManager');

class McpToolClient {
  constructor(connectionManager) {
    this._connectionManager = connectionManager || new McpConnectionManager(config);
  }

  async _callTool(tool, args = {}) {
    const client = this._connectionManager.getClient();
    if (!client) {
      return { success: false, error: 'MCP is not connected' };
    }
    try {
      const result = await client.callTool(tool, args);
      return { success: true, data: result };
    } catch (err) {
      console.error(`[McpToolClient] Error calling tool "${tool}":`, err.message);
      return { success: false, error: err.message, details: err };
    }
  }

  async ping() {
    return this._callTool('ping');
  }

  async help(topic) {
    const args = topic !== undefined ? { topic } : {};
    return this._callTool('help', args);
  }

  async config() {
    return this._callTool('config');
  }

  async describe() {
    return this._callTool('describe');
  }

  async getStructure(objectName) {
    return this._callTool('get_structure', { object: objectName });
  }

  async query(params) {
    return this._callTool('query', { params });
  }

  async executeQuery(text) {
    return this._callTool('execute_query', { text });
  }
}

module.exports = McpToolClient;
