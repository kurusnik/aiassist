const HttpMcpClient = require('./transports/httpTransport');

class McpClientFactory {
  static _transports = new Map();

  static registerTransport(type, builder) {
    if (typeof builder !== 'function') {
      throw new Error('Transport builder must be a function');
    }
    this._transports.set(type, builder);
  }

  static createClient(config) {
    const type = config.transport || 'http';
    const builder = this._transports.get(type);
    if (!builder) {
      throw new Error(`Unknown MCP transport type: "${type}". Available: ${Array.from(this._transports.keys()).join(', ') || 'none'}`);
    }
    return builder(config);
  }

  static listTransports() {
    return Array.from(this._transports.keys());
  }
}

McpClientFactory.registerTransport('http', (config) => new HttpMcpClient(config));

module.exports = McpClientFactory;