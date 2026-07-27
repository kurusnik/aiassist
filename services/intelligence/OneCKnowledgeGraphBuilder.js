/**
 * OneCKnowledgeGraphBuilder — builds semantic graph from Knowledge Layer metadata.
 *
 * Reads existing knowledge.objects, knowledge.fields, knowledge.relations
 * and generates semantic_graph_nodes, semantic_graph_edges, semantic_suggestions.
 *
 * Flow:
 *   1. Scan all knowledge.objects → create graph nodes (object → concept)
 *   2. Scan knowledge.fields with reference_type → create graph edges
 *   3. Scan knowledge.relations → create graph edges
 *   4. Mine business concepts from object names and synonyms
 *   5. Generate suggestions for unmapped objects
 *
 * Does NOT:
 *   - Create new metadata (Knowledge Layer is read-only)
 *   - Duplicate MCP metadata discovery
 *   - Use hardcoded business rules (only metadata-driven inference)
 */

const pool = require('../../db');

class OneCKnowledgeGraphBuilder {
  constructor() {
    this._trace = null;
  }

  /**
   * Build the full semantic graph from Knowledge Layer.
   *
   * @param {object} opts
   * @param {number|null} opts.projectId - Project scope (null = global)
   * @param {boolean} opts.dryRun - If true, don't write to DB
   * @returns {Promise<object>} Build result with counts
   */
  async build(opts = {}) {
    const { projectId = null, dryRun = false } = opts;
    const trace = { stage: 'KnowledgeGraphBuilder', steps: [], output: null };
    const stats = { objectsScanned: 0, fieldsScanned: 0, nodesCreated: 0, edgesCreated: 0, suggestionsCreated: 0, skipped: 0 };

    console.log(`[KnowledgeGraphBuilder] Starting build (project: ${projectId || 'global'}, dryRun: ${dryRun})`);

    // Step 1: Get all knowledge objects
    const objects = await this._getKnowledgeObjects();
    stats.objectsScanned = objects.length;
    trace.steps.push({ step: 'scan_objects', count: objects.length });
    console.log(`[KnowledgeGraphBuilder] Objects scanned: ${objects.length}`);

    // Step 2: Get all knowledge fields
    const fields = await this._getKnowledgeFields();
    stats.fieldsScanned = fields.length;
    trace.steps.push({ step: 'scan_fields', count: fields.length });
    console.log(`[KnowledgeGraphBuilder] Fields scanned: ${fields.length}`);

    // Step 3: Get all knowledge relations
    const relations = await this._getKnowledgeRelations();
    trace.steps.push({ step: 'scan_relations', count: relations.length });
    console.log(`[KnowledgeGraphBuilder] Knowledge relations: ${relations.length}`);

    // Step 4: Build nodes from objects
    const nodeMap = new Map(); // object_name → node_id
    for (const obj of objects) {
      const concept = this._extractConcept(obj);
      if (!concept) { stats.skipped++; continue; }

      if (!dryRun) {
        const node = await this._upsertNode(concept, obj.full_name, obj.type, projectId);
        nodeMap.set(obj.full_name, node.id);
        stats.nodesCreated++;
      } else {
        nodeMap.set(obj.full_name, -stats.nodesCreated - 1);
        stats.nodesCreated++;
      }
    }
    trace.steps.push({ step: 'nodes_created', count: stats.nodesCreated });
    console.log(`[KnowledgeGraphBuilder] Nodes created: ${stats.nodesCreated}`);

    // Step 5: Build edges from fields (reference_type detection)
    for (const field of fields) {
      const refTargets = this._parseReferenceType(field.reference_type);
      if (refTargets.length === 0) continue;

      const fromObj = this._findObjectByField(objects, field);
      if (!fromObj) continue;

      for (const targetFullName of refTargets) {
        const fromNodeId = nodeMap.get(fromObj.full_name);
        const toNodeId = nodeMap.get(targetFullName);
        if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) continue;

        const edge = {
          from: fromNodeId,
          to: toNodeId,
          type: 'reference',
          field: field.name,
          confidence: 0.9,
        };

        if (!dryRun) {
          await this._upsertEdge(edge, projectId);
        }
        stats.edgesCreated++;
      }
    }

    // Step 6: Build edges from knowledge.relations
    for (const rel of relations) {
      const fromObj = objects.find(o => o.id === rel.from_object_id);
      const toObj = objects.find(o => o.id === rel.to_object_id);
      if (!fromObj || !toObj) continue;

      const fromNodeId = nodeMap.get(fromObj.full_name);
      const toNodeId = nodeMap.get(toObj.full_name);
      if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) continue;

      const edge = {
        from: fromNodeId,
        to: toNodeId,
        type: rel.relation_type || 'reference',
        field: rel.from_field || null,
        confidence: 0.85,
      };

      if (!dryRun) {
        await this._upsertEdge(edge, projectId);
      }
      stats.edgesCreated++;
    }

    // Step 7: Build edges from table part fields (field name matches object name pattern)
    const tablePartEdges = this._buildTablePartEdges(fields, objects, nodeMap);
    if (!dryRun) {
      for (const edge of tablePartEdges) {
        await this._upsertEdge(edge, projectId);
      }
    }
    stats.edgesCreated += tablePartEdges.length;
    trace.steps.push({ step: 'edges_created', count: stats.edgesCreated });
    console.log(`[KnowledgeGraphBuilder] Edges created: ${stats.edgesCreated}`);

    // Step 8: Generate suggestions for unmapped objects
    const suggestions = this._generateSuggestions(objects, nodeMap);
    if (!dryRun) {
      for (const s of suggestions) {
        await this._insertSuggestion(s, projectId);
      }
    }
    stats.suggestionsCreated = suggestions.length;
    trace.steps.push({ step: 'suggestions', count: suggestions.length });
    console.log(`[KnowledgeGraphBuilder] Suggestions: ${stats.suggestionsCreated}`);

    trace.output = stats;
    this._trace = trace;

    console.log(`[KnowledgeGraphBuilder] Build complete: ${JSON.stringify(stats)}`);
    return stats;
  }

  /**
   * Get graph status (counts of nodes, edges, last build).
   */
  async getStatus(projectId) {
    const nodes = await pool.query('SELECT COUNT(*) AS cnt FROM semantic_graph_nodes WHERE project_id IS NOT DISTINCT FROM $1', [projectId || null]);
    const edges = await pool.query('SELECT COUNT(*) AS cnt FROM semantic_graph_edges WHERE project_id IS NOT DISTINCT FROM $1', [projectId || null]);
    const suggestions = await pool.query('SELECT COUNT(*) AS cnt FROM semantic_suggestions WHERE project_id IS NOT DISTINCT FROM $1 AND status = $2', [projectId || null, 'pending']);
    const lastBuild = await pool.query('SELECT MAX(created_at) AS ts FROM semantic_graph_nodes WHERE project_id IS NOT DISTINCT FROM $1', [projectId || null]);

    return {
      status: parseInt(nodes.rows[0].cnt) > 0 ? 'ready' : 'empty',
      nodes: parseInt(nodes.rows[0].cnt),
      edges: parseInt(edges.rows[0].cnt),
      pendingSuggestions: parseInt(suggestions.rows[0].cnt),
      lastBuild: lastBuild.rows[0].ts || null,
    };
  }

  // ── Knowledge Layer queries ────────────────────────────────────

  async _getKnowledgeObjects() {
    try {
      const result = await pool.query(`
        SELECT id, type, name, synonym, full_name, comment
        FROM knowledge.objects
        WHERE full_name IS NOT NULL
        ORDER BY type, name
      `);
      return result.rows;
    } catch (err) {
      console.log(`[KnowledgeGraphBuilder] _getKnowledgeObjects error: ${err.message}`);
      return [];
    }
  }

  async _getKnowledgeFields() {
    try {
      const result = await pool.query(`
        SELECT f.id, f.object_id, f.name, f.synonym, f.datatype, f.reference_type
        FROM knowledge.fields f
        WHERE f.reference_type IS NOT NULL AND f.reference_type != ''
        ORDER BY f.object_id, f.name
      `);
      return result.rows;
    } catch (err) {
      console.log(`[KnowledgeGraphBuilder] _getKnowledgeFields error: ${err.message}`);
      return [];
    }
  }

  async _getKnowledgeRelations() {
    try {
      const result = await pool.query(`
        SELECT id, from_object_id, from_field, to_object_id, relation_type
        FROM knowledge.relations
        ORDER BY from_object_id
      `);
      return result.rows;
    } catch (err) {
      console.log(`[KnowledgeGraphBuilder] _getKnowledgeRelations error: ${err.message}`);
      return [];
    }
  }

  // ── Concept extraction from metadata ───────────────────────────

  _extractConcept(obj) {
    if (!obj) return null;
    const fullName = obj.full_name || '';
    const name = obj.name || '';
    const synonym = obj.synonym || '';

    // Use synonym if available (it's the human-readable name)
    const conceptSource = synonym || name;
    if (!conceptSource) return null;

    return conceptSource.toLowerCase().trim();
  }

  _parseReferenceType(refType) {
    if (!refType || typeof refType !== 'string') return [];

    const targets = [];
    // Reference types can contain full names like "Справочник.Номенклатура" or "Документ.РеализацияТоваровУслуг"
    // They may also contain comma-separated or newline-separated values
    const parts = refType.split(/[,\n;]+/).map(s => s.trim()).filter(s => s.length > 0);

    for (const part of parts) {
      const cleaned = part.replace(/[\[\]]/g, '').trim();
      if (cleaned.includes('.')) {
        targets.push(cleaned);
      }
    }

    return targets;
  }

  _findObjectByField(objects, field) {
    return objects.find(o => o.id === field.object_id);
  }

  _buildTablePartEdges(fields, objects, nodeMap) {
    const edges = [];
    // Find fields that are table parts (object_type = 'ТабличнаяЧасть')
    // These create edges from document → referenced object
    for (const field of fields) {
      if (!field.name || !field.reference_type) continue;

      const obj = objects.find(o => o.id === field.object_id);
      if (!obj) continue;

      // If the field name appears to be a table part reference
      const refTargets = this._parseReferenceType(field.reference_type);
      for (const target of refTargets) {
        const fromNodeId = nodeMap.get(obj.full_name);
        const toNodeId = nodeMap.get(target);
        if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) continue;

        edges.push({
          from: fromNodeId,
          to: toNodeId,
          type: 'table_part',
          field: field.name,
          confidence: 0.85,
        });
      }
    }
    return edges;
  }

  // ── Business concept suggestions ───────────────────────────────

  _generateSuggestions(objects, nodeMap) {
    const suggestions = [];
    const seen = new Set();

    for (const obj of objects) {
      if (!obj.full_name) continue;
      const concept = this._extractConcept(obj);
      if (!concept) continue;

      const key = concept;
      if (seen.has(key)) continue;
      seen.add(key);

      // Auto-approve obvious concepts: high confidence from knowledge_layer with synonym
      const hasSynonym = obj.synonym && obj.synonym.length > 1;
      const autoApprove = hasSynonym && obj.type !== 'Обработка' && obj.type !== 'Отчет';

      suggestions.push({
        term: concept,
        suggested_mapping: obj.full_name,
        confidence: autoApprove ? 0.95 : 0.6,
        status: autoApprove ? 'auto_approved' : 'pending',
        source: 'graph_mining',
      });
    }

    return suggestions;
  }

  // ── DB operations ──────────────────────────────────────────────

  async _upsertNode(concept, objectName, nodeType, projectId) {
    const sql = `
      INSERT INTO semantic_graph_nodes (concept, object_name, node_type, confidence, source, project_id)
      VALUES ($1, $2, $3, 0.8, 'knowledge_layer', $4)
      ON CONFLICT (concept, object_name, project_id)
      DO UPDATE SET confidence = GREATEST(semantic_graph_nodes.confidence, 0.8)
      RETURNING id
    `;
    const result = await pool.query(sql, [concept, objectName, nodeType || 'metadata_object', projectId || null]);
    return result.rows[0];
  }

  async _upsertEdge(edge, projectId) {
    const sql = `
      INSERT INTO semantic_graph_edges (from_node, to_node, relation_type, field_name, confidence, source, project_id)
      VALUES ($1, $2, $3, $4, $5, 'knowledge_layer', $6)
      ON CONFLICT (from_node, to_node, relation_type, project_id)
      DO UPDATE SET confidence = GREATEST(semantic_graph_edges.confidence, $5),
                    field_name = COALESCE($4, semantic_graph_edges.field_name)
      RETURNING id
    `;
    try {
      const result = await pool.query(sql, [edge.from, edge.to, edge.type, edge.field, edge.confidence, projectId || null]);
      return result.rows[0];
    } catch (err) {
      console.log(`[KnowledgeGraphBuilder] _upsertEdge error: ${err.message}`);
      return null;
    }
  }

  async _insertSuggestion(suggestion, projectId) {
    const sql = `
      INSERT INTO semantic_suggestions (term, suggested_mapping, confidence, status, source, project_id)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    try {
      await pool.query(sql, [suggestion.term, suggestion.suggested_mapping, suggestion.confidence, suggestion.status || 'pending', suggestion.source, projectId || null]);
    } catch (err) {
      // Duplicate suggestions are OK
    }
  }

  // ── Approval ───────────────────────────────────────────────────

  async approveSuggestion(suggestionId, projectId) {
    const sql = `UPDATE semantic_suggestions SET status = 'approved' WHERE id = $1 AND (project_id = $2 OR project_id IS NULL)`;
    const result = await pool.query(sql, [suggestionId, projectId || null]);
    return result.rowCount > 0;
  }

  async rejectSuggestion(suggestionId, projectId) {
    const sql = `UPDATE semantic_suggestions SET status = 'rejected' WHERE id = $1 AND (project_id = $2 OR project_id IS NULL)`;
    const result = await pool.query(sql, [suggestionId, projectId || null]);
    return result.rowCount > 0;
  }

  async getPendingSuggestions(projectId, limit = 50) {
    const sql = `SELECT * FROM semantic_suggestions WHERE status = 'pending' AND (project_id = $1 OR project_id IS NULL) ORDER BY confidence DESC LIMIT $2`;
    const result = await pool.query(sql, [projectId || null, limit]);
    return result.rows;
  }

  getLastTrace() {
    return this._trace;
  }
}

module.exports = OneCKnowledgeGraphBuilder;
