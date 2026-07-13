const config = require('./config');
const McpConnectionManager = require('./McpConnectionManager');
const McpClientFactory = require('./McpClientFactory');
const McpToolClient = require('./tools/McpToolClient');

const connectionManager = new McpConnectionManager(config);
const mcpToolClient = new McpToolClient(connectionManager);

module.exports = { config, McpConnectionManager, McpClientFactory, McpToolClient, connectionManager, mcpToolClient };