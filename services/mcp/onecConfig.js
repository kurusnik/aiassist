const url = process.env.ONEC_MCP_URL ? new URL(process.env.ONEC_MCP_URL) : null;

const ONEC_MCP_ENABLED = (process.env.ONEC_MCP_ENABLED || '').trim().toLowerCase();
const config = {
  enabled: ONEC_MCP_ENABLED === 'true' || ONEC_MCP_ENABLED === '1',
  transport: 'http',
  host: url ? url.hostname : 'localhost',
  port: url ? parseInt(url.port, 10) || 80 : 3001,
  path: url ? url.pathname : '/mcp',
  timeout: 30000,
  headers: {}
};

const login = process.env.ONEC_MCP_LOGIN || '';
const password = process.env.ONEC_MCP_PASSWORD || '';

if (login && password) {
  const credentials = Buffer.from(`${login}:${password}`).toString('base64');
  config.headers['Authorization'] = `Basic ${credentials}`;
}

module.exports = config;