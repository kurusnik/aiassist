const config = require('./config');
const McpClientFactory = require('./McpClientFactory');

class McpConnectionManager {
  constructor(cfg = config) {
    this.config = cfg;
    this._client = null;
    this._connected = false;
  }

  async connect() {
    if (!this.config.enabled) {
      this._connected = false;
      this._client = null;
      return false;
    }
    try {
      this._client = McpClientFactory.createClient(this.config);
      this._connected = true;
      return true;
    } catch (err) {
      this._connected = false;
      this._client = null;
      return false;
    }
  }

  disconnect() {
    this._client = null;
    this._connected = false;
  }

  isConnected() {
    return this._connected && this._client !== null;
  }

  getClient() {
    return this._client;
  }

  getStatus() {
    return {
      enabled: this.config.enabled,
      connected: this._connected,
      transport: this.config.transport,
      host: this.config.host,
      port: this.config.port,
      path: this.config.path
    };
  }

  async reload() {
    this.disconnect();
    return this.connect();
  }
}

module.exports = McpConnectionManager;