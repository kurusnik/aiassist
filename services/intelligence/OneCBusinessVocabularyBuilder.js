/**
 * OneCBusinessVocabularyBuilder — builds business vocabulary from Knowledge Layer.
 *
 * Creates a rich dictionary of business terms for a specific 1C configuration
 * by analyzing objects, fields, graph nodes, and edges.
 *
 * Output is stored in existing semantic infrastructure:
 *   - semantic_concepts (canonical terms)
 *   - semantic_aliases (alternative names)
 *   - semantic_mappings (concept → 1C object)
 *   - semantic_relationships (inter-concept relations)
 *
 * Does NOT create a separate knowledge base.
 */

const pool = require('../../db');

class OneCBusinessVocabularyBuilder {
  constructor() {
    this._trace = null;
  }

  /**
   * Build business vocabulary for a 1C configuration.
   *
   * @param {object} opts
   * @param {number|null} opts.projectId
   * @param {boolean} opts.dryRun
   * @returns {Promise<object>} Vocabulary build result
   */
  async build(opts = {}) {
    const { projectId = null, dryRun = false } = opts;
    const trace = { stage: 'BusinessVocabularyBuilder', steps: [] };
    const stats = { termsCreated: 0, aliasesCreated: 0, mappingsCreated: 0, relationsCreated: 0 };

    console.log(`[BusinessVocabularyBuilder] Starting build (project: ${projectId || 'global'})`);

    // Step 1: Get all graph nodes with concepts
    const nodes = await pool.query(
      `SELECT concept, object_name, node_type, confidence
       FROM semantic_graph_nodes
       WHERE (project_id = $1 OR project_id IS NULL)
       ORDER BY confidence DESC`,
      [projectId || null]
    );
    trace.steps.push({ step: 'nodes', count: nodes.rows.length });

    // Step 2: Get all graph edges
    const edges = await pool.query(
      `SELECT e.relation_type, e.field_name, e.confidence,
              fn.concept AS from_concept, fn.object_name AS from_object,
              tn.concept AS to_concept, tn.object_name AS to_object
       FROM semantic_graph_edges e
       JOIN semantic_graph_nodes fn ON fn.id = e.from_node
       JOIN semantic_graph_nodes tn ON tn.id = e.to_node
       WHERE e.approved = TRUE
         AND (e.project_id = $1 OR e.project_id IS NULL)`,
      [projectId || null]
    );
    trace.steps.push({ step: 'edges', count: edges.rows.length });

    // Step 3: Build vocabulary entries
    const vocabulary = this._buildVocabulary(nodes.rows, edges.rows);
    trace.steps.push({ step: 'vocabulary', terms: Object.keys(vocabulary).length });

    // Step 4: Persist vocabulary to semantic infrastructure
    if (!dryRun) {
      for (const [term, entry] of Object.entries(vocabulary)) {
        const conceptResult = await this._upsertConcept(term);
        if (conceptResult) {
          stats.termsCreated++;

          // Create aliases
          for (const alias of entry.aliases) {
            const ok = await this._insertAlias(conceptResult.id, alias);
            if (ok) stats.aliasesCreated++;
          }

          // Create mapping
          const mappingOk = await this._insertMapping(conceptResult.id, entry.object, entry.confidence, projectId);
          if (mappingOk) stats.mappingsCreated++;
        }
      }

      // Step 5: Create relationships from edges
      for (const edge of edges.rows) {
        if (edge.from_concept === edge.to_concept) continue;
        const relOk = await this._insertRelationship(edge, projectId);
        if (relOk) stats.relationsCreated++;
      }
    }

    trace.output = stats;
    this._trace = trace;

    console.log(`[BusinessVocabularyBuilder] Complete: ${JSON.stringify(stats)}`);
    return stats;
  }

  /**
   * Build vocabulary in-memory without persisting.
   */
  _buildVocabulary(nodes, edges) {
    const vocab = {};

    // Process nodes
    for (const node of nodes) {
      if (!node.concept || !node.object_name) continue;
      const term = node.concept;

      if (!vocab[term]) {
        vocab[term] = {
          term,
          aliases: [],
          object: node.object_name,
          related: [],
          operations: [],
          confidence: node.confidence,
          nodeType: node.node_type,
        };
      }

      // If we already have this concept mapped to a different object, prefer higher confidence
      if (node.confidence > vocab[term].confidence) {
        vocab[term].object = node.object_name;
        vocab[term].confidence = node.confidence;
      }
    }

    // Process edges to find related concepts and operations
    for (const edge of edges) {
      if (edge.from_concept === edge.to_concept) continue;

      if (vocab[edge.from_concept]) {
        if (!vocab[edge.from_concept].related.includes(edge.to_concept)) {
          vocab[edge.from_concept].related.push(edge.to_concept);
        }
        const op = this._inferOperation(edge.relation_type);
        if (op && !vocab[edge.from_concept].operations.includes(op)) {
          vocab[edge.from_concept].operations.push(op);
        }
      }
    }

    // Generate aliases from object names
    for (const [term, entry] of Object.entries(vocab)) {
      entry.aliases = this._generateAliases(term, entry.object, entry.nodeType);
    }

    return vocab;
  }

  _inferOperation(relationType) {
    const map = {
      'reference': 'list',
      'table_part': 'list',
      'dimension': 'aggregate',
      'attribute': 'list',
    };
    return map[relationType] || null;
  }

  _generateAliases(term, objectName, nodeType) {
    const aliases = [];
    if (!objectName) return aliases;

    const parts = objectName.split('.');
    if (parts.length >= 2) {
      const name = parts[parts.length - 1];
      // Add the object name as alias (without prefix)
      if (name.toLowerCase() !== term) {
        aliases.push(name.toLowerCase());
      }
    }

    // Generate common Russian variations
    if (term.endsWith('ие')) {
      aliases.push(term.slice(0, -2) + 'ия'); // реализация → реализация (no change but different form)
      aliases.push(term.slice(0, -2) + 'ий');
    }

    return aliases.filter((a, i) => aliases.indexOf(a) === i);
  }

  // ── DB operations ──────────────────────────────────────────────

  async _upsertConcept(term) {
    try {
      const result = await pool.query(
        `INSERT INTO semantic_concepts (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [term]
      );
      return result.rows[0];
    } catch (err) {
      console.log(`[BusinessVocabularyBuilder] _upsertConcept error: ${err.message}`);
      return null;
    }
  }

  async _insertAlias(conceptId, alias) {
    try {
      await pool.query(
        `INSERT INTO semantic_aliases (concept_id, alias)
         VALUES ($1, $2)
         ON CONFLICT (concept_id, alias) DO NOTHING`,
        [conceptId, alias]
      );
      return true;
    } catch (err) {
      return false;
    }
  }

  async _insertMapping(conceptId, metadataObject, confidence, projectId) {
    if (!metadataObject) return false;
    try {
      await pool.query(
        `INSERT INTO semantic_mappings (concept_id, metadata_object, mapping_type, confidence, approved, source, project_id)
         VALUES ($1, $2, 'attribute', $3, FALSE, 'vocabulary_builder', $4)
         ON CONFLICT DO NOTHING`,
        [conceptId, metadataObject, confidence, projectId || null]
      );
      return true;
    } catch (err) {
      return false;
    }
  }

  async _insertRelationship(edge, projectId) {
    try {
      await pool.query(
        `INSERT INTO semantic_relationships
         (from_concept, from_object, from_field, relation_type, to_concept, to_object, to_field, confidence, source, approved)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'vocabulary_builder', FALSE)
         ON CONFLICT DO NOTHING`,
        [edge.from_concept, edge.from_object, edge.field_name, edge.relation_type,
         edge.to_concept, edge.to_object, null, edge.confidence]
      );
      return true;
    } catch (err) {
      return false;
    }
  }

  getLastTrace() {
    return this._trace;
  }
}

module.exports = OneCBusinessVocabularyBuilder;
