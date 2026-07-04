const config = require('./config');
const McpConnectionManager = require('./McpConnectionManager');
const McpClientFactory = require('./McpClientFactory');

const connectionManager = new McpConnectionManager(config);

module.exports = { config, McpConnectionManager, McpClientFactory, connectionManager };