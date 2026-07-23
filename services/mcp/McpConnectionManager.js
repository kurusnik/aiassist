const config = require('./config');
const McpClientFactory = require('./McpClientFactory');

class McpConnectionManager {
  constructor(cfg = config) {
    this.config = cfg;
    this._client = null;
    this._connected = false;
  }

  async connect() {
    const url = `${this.config.transport}://${this.config.host}:${this.config.port}${this.config.path}`;
    console.log(`[McpConnectionManager] connect() called — transport: ${this.config.transport}, url: ${url}`);
    if (!this.config.enabled) {
      console.log(`[McpConnectionManager] connect() skipped — config.enabled is false`);
      this._connected = false;
      this._client = null;
      return false;
    }
    console.log(`[McpConnectionManager] Creating client for transport "${this.config.transport}"...`);
    try {
      this._client = McpClientFactory.createClient(this.config);
      this._connected = true;
      console.log(`[McpConnectionManager] Client created, connection established`);
      return true;
    } catch (err) {
      console.error(`[McpConnectionManager] Client creation failed:`);
      console.error(`[McpConnectionManager] Error message: ${err.message}`);
      console.error(`[McpConnectionManager] Error stack: ${err.stack}`);
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