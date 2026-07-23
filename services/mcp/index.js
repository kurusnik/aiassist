const config = require('./config');
const McpConnectionManager = require('./McpConnectionManager');
const McpClientFactory = require('./McpClientFactory');
const McpToolClient = require('./tools/McpToolClient');
const onecConfig = require('./onecConfig');

const connectionManager = new McpConnectionManager(config);
const mcpToolClient = new McpToolClient(connectionManager);

const onecConnectionManager = new McpConnectionManager(onecConfig);
// 1C MCP uses dedicated connection manager and tool client
// because it has separate authentication/configuration
const onecToolClient = new McpToolClient(onecConnectionManager);

module.exports = {
  config,
  McpConnectionManager,
  McpClientFactory,
  McpToolClient,
  connectionManager,
  mcpToolClient,
  onecConfig,
  onecConnectionManager,
  onecToolClient
};