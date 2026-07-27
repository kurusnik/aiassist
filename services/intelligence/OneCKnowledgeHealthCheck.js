/**
 * OneCKnowledgeHealthCheck — system readiness check for OneC pipeline.
 *
 * Verifies that all subsystems are ready for beta testing:
 *   - Knowledge Layer (objects, fields, relations)
 *   - Semantic Layer (concepts, mappings, graph nodes, graph edges)
 *   - MCP connectivity
 *
 * Usage:
 *   const healthCheck = new OneCKnowledgeHealthCheck();
 *   const report = await healthCheck.generateReport();
 *   // report.status === 'READY' | 'DEGRADED' | 'NOT_READY'
 */

const pool = require('../../db');

class OneCKnowledgeHealthCheck {
  constructor() {
    this._mcpClient = null;
  }

  setMcpClient(client) {
    this._mcpClient = client;
  }

  /**
   * Generate a full system health report.
   *
   * @returns {Promise<object>}
   */
  async generateReport() {
    const checks = {};
    const errors = [];

    // 1. Knowledge Layer
    try {
      checks.knowledgeLayer = await this.checkObjects();
    } catch (err) {
      checks.knowledgeLayer = { status: 'ERROR', error: err.message, objects: 0, fields: 0, relations: 0 };
      errors.push(`knowledgeLayer: ${err.message}`);
    }

    // 2. Semantic Layer
    try {
      checks.semantic = await this.checkSemanticReady();
    } catch (err) {
      checks.semantic = { status: 'ERROR', error: err.message, concepts: 0, mappings: 0, graphNodes: 0, graphEdges: 0 };
      errors.push(`semantic: ${err.message}`);
    }

    // 3. MCP
    try {
      checks.mcp = await this.checkMcpReady();
    } catch (err) {
      checks.mcp = { status: 'ERROR', error: err.message };
      errors.push(`mcp: ${err.message}`);
    }

    // Compute overall status
    const statuses = [checks.knowledgeLayer?.status, checks.semantic?.status, checks.mcp?.status].filter(Boolean);
    let overallStatus;
    if (statuses.every(s => s === 'READY')) {
      overallStatus = 'READY';
    } else if (statuses.every(s => s === 'NOT_READY')) {
      overallStatus = 'NOT_READY';
    } else {
      overallStatus = 'DEGRADED';
    }

    const report = {
      status: overallStatus,
      checks: [
        { name: 'Knowledge Layer', status: checks.knowledgeLayer?.status || 'UNKNOWN', details: checks.knowledgeLayer },
        { name: 'Semantic Graph', status: checks.semantic?.status || 'UNKNOWN', details: checks.semantic },
        { name: 'MCP', status: checks.mcp?.status || 'UNKNOWN', details: checks.mcp },
      ],
      errors,
      timestamp: new Date().toISOString(),
    };

    return report;
  }

  /**
   * Check Knowledge Layer status.
   */
  async checkObjects() {
    const objectsResult = await pool.query('SELECT COUNT(*) AS cnt FROM knowledge.objects');
    const fieldsResult = await pool.query('SELECT COUNT(*) AS cnt FROM knowledge.fields');
    const relationsResult = await pool.query('SELECT COUNT(*) AS cnt FROM knowledge.relations');

    const objects = parseInt(objectsResult.rows[0].cnt);
    const fields = parseInt(fieldsResult.rows[0].cnt);
    const relations = parseInt(relationsResult.rows[0].cnt);

    const hasData = objects > 0 && fields > 0;

    return {
      status: hasData ? 'READY' : 'NOT_READY',
      objects,
      fields,
      relations,
    };
  }

  /**
   * Check Semantic Layer readiness.
   */
  async checkSemanticReady() {
    const conceptsResult = await pool.query('SELECT COUNT(*) AS cnt FROM semantic_concepts');
    const mappingsResult = await pool.query('SELECT COUNT(*) AS cnt FROM semantic_mappings');

    let graphNodes = 0;
    let graphEdges = 0;
    let suggestions = 0;
    try {
      const nodesResult = await pool.query('SELECT COUNT(*) AS cnt FROM semantic_graph_nodes');
      graphNodes = parseInt(nodesResult.rows[0].cnt);
      const edgesResult = await pool.query('SELECT COUNT(*) AS cnt FROM semantic_graph_edges');
      graphEdges = parseInt(edgesResult.rows[0].cnt);
      const suggestionsResult = await pool.query('SELECT COUNT(*) AS cnt FROM semantic_suggestions');
      suggestions = parseInt(suggestionsResult.rows[0].cnt);
    } catch (err) {
      // Tables may not exist yet
    }

    const concepts = parseInt(conceptsResult.rows[0].cnt);
    const mappings = parseInt(mappingsResult.rows[0].cnt);

    const hasData = concepts > 0;
    const hasGraph = graphNodes > 0;

    let status;
    if (hasData && hasGraph) {
      status = 'READY';
    } else if (hasData) {
      status = 'DEGRADED'; // has concepts but graph not built
    } else {
      status = 'NOT_READY';
    }

    return {
      status,
      concepts,
      mappings,
      graphNodes,
      graphEdges,
      suggestions,
    };
  }

  /**
   * Check MCP connectivity.
   */
  async checkMcpReady() {
    if (!this._mcpClient) {
      return { status: 'NOT_READY', error: 'MCP client not configured' };
    }

    try {
      const result = await this._mcpClient._callTool('ping', {});
      if (result && result.success) {
        return { status: 'READY', latency: result.latency || null };
      }
      return { status: 'NOT_READY', error: 'MCP ping failed' };
    } catch (err) {
      return { status: 'NOT_READY', error: err.message };
    }
  }
}

module.exports = OneCKnowledgeHealthCheck;
