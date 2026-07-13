class HttpMcpClient {
  constructor(config) {
    this.url = `http://${config.host}:${config.port}${config.path}`;
    this.timeout = config.timeout || 30000;
    this.headers = {
      'Content-Type': 'application/json',
      ...(config.headers || {})
    };
  }

  async getMetadata() {
    return this.callTool('getMetadata');
  }

  async callTool(action, args = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ action, ...args }),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`MCP HTTP error: ${response.status}`);
      }
      return response.json();
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = HttpMcpClient;