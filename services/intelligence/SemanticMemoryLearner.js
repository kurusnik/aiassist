/**
 * SemanticMemoryLearner — discovers 1C metadata via MCP and creates semantic_mappings.
 *
 * When the pipeline encounters an unknown term (cold start or low confidence),
 * this module:
 *   1. Calls MCP `describe` to find matching metadata objects
 *   2. Ranks candidates by relevance to the user's intent
 *   3. Creates a `source='mcp_discovery'` mapping in semantic_mappings
 *   4. Returns suggestions for user confirmation
 *
 * This closes the learning loop: unknown term → MCP discovery → mapping → future queries use it.
 *
 * Usage:
 *   const learner = new SemanticMemoryLearner();
 *   const suggestions = await learner.discoverAndSuggest(term, projectId, semanticOperation);
 */

const pool = require('../../db');

class SemanticMemoryLearner {
  constructor(mcpClient) {
    this._mcpClient = mcpClient || null;
  }

  /**
   * Set or replace the MCP client (e.g., after reconnection).
   */
  setMcpClient(client) {
    this._mcpClient = client;
  }

  /**
   * Discover metadata objects for a term via MCP and suggest mappings.
   *
   * @param {string} term - Business term to discover (e.g., 'реализация', 'бренд')
   * @param {number|null} projectId - Project scope for the mapping
   * @param {string} semanticOperation - e.g., 'document_count', 'stock_balance'
   * @param {object} opts - Optional: { entity, hints }
   * @returns {Promise<{ discovered: boolean, candidates: Array, suggestedMapping: object|null }>}
   */
  async discoverAndSuggest(term, projectId, semanticOperation, opts = {}) {
    const trace = {
      stage: 'SemanticMemoryLearner',
      term,
      projectId,
      semanticOperation,
      steps: [],
    };

    if (!term || !this._mcpClient) {
      trace.steps.push({ step: 'validate', result: this._mcpClient ? 'no_term' : 'no_mcp_client' });
      return { discovered: false, candidates: [], suggestedMapping: null, trace };
    }

    // Step 1: Check if we already have a high-confidence mapping for this term
    const existing = await this._checkExistingMapping(term, projectId);
    if (existing) {
      trace.steps.push({ step: 'existing_check', result: 'found', mapping: existing });
      return { discovered: false, candidates: [], suggestedMapping: existing, trace, alreadyMapped: true };
    }

    // Step 2: Call MCP describe to find matching objects
    let mcpResult;
    try {
      mcpResult = await this._mcpClient._callTool('describe', { find: term });
      trace.steps.push({ step: 'mcp_describe', result: mcpResult.success ? 'success' : 'failed', error: mcpResult.error });
    } catch (err) {
      trace.steps.push({ step: 'mcp_describe', result: 'error', error: err.message });
      return { discovered: false, candidates: [], suggestedMapping: null, trace };
    }

    if (!mcpResult.success || !mcpResult.data) {
      return { discovered: false, candidates: [], suggestedMapping: null, trace };
    }

    // Step 3: Parse MCP response — look for Найдено array
    const raw = this._parseMcpResponse(mcpResult.data);
    if (!raw || !Array.isArray(raw.Найдено) || raw.Найдено.length === 0) {
      trace.steps.push({ step: 'parse_response', result: 'no_objects_found' });
      return { discovered: false, candidates: [], suggestedMapping: null, trace };
    }

    // Step 4: Rank candidates by relevance to the semantic operation
    const candidates = this._rankCandidates(raw.Найдено, semanticOperation, term);
    trace.steps.push({ step: 'rank_candidates', count: candidates.length, top: candidates.slice(0, 3).map(c => ({ name: c.ПолноеИмя, score: c._score })) });

    if (candidates.length === 0) {
      return { discovered: false, candidates: [], suggestedMapping: null, trace };
    }

    // Step 5: Create mapping for the best candidate (with source='mcp_discovery')
    const best = candidates[0];
    const mappingType = this._inferMappingType(best, semanticOperation);

    const suggestedMapping = {
      metadata_object: best.ПолноеИмя || best.Имя,
      metadata_field: null,
      mapping_type: mappingType,
      confidence: Math.min(best._score / 100, 0.7), // MCP discovery gets max 0.7 confidence
      source: 'mcp_discovery',
    };

    // Step 6: Persist the mapping (unapproved — requires user confirmation)
    try {
      await this._persistMapping(term, projectId, suggestedMapping);
      trace.steps.push({ step: 'persist_mapping', result: 'created', object: suggestedMapping.metadata_object });
    } catch (err) {
      trace.steps.push({ step: 'persist_mapping', result: 'error', error: err.message });
    }

    console.log(`[SemanticMemoryLearner] Discovered: "${term}" → ${suggestedMapping.metadata_object} (score: ${best._score})`);

    return {
      discovered: true,
      candidates: candidates.slice(0, 5).map(c => ({
        name: c.ПолноеИмя || c.Имя,
        type: c.Тип,
        score: c._score,
      })),
      suggestedMapping,
      trace,
    };
  }

  /**
   * Auto-confirm a mapping when the user explicitly selects it.
   * This creates/updates a source='user_confirmation' mapping.
   */
  async confirmMapping(term, projectId, metadataObject, metadataField, mappingType) {
    const trace = { stage: 'SemanticMemoryLearner.confirm', term, metadataObject };

    let concept = await pool.query('SELECT id FROM semantic_concepts WHERE name = $1', [term]);
    if (concept.rows.length === 0) {
      concept = await pool.query('INSERT INTO semantic_concepts (name) VALUES ($1) RETURNING id', [term]);
    }
    const conceptId = concept.rows[0].id;

    // Upsert: update existing or insert new
    const existing = await pool.query(
      `SELECT id FROM semantic_mappings
       WHERE concept_id = $1 AND metadata_object = $2
         AND (metadata_field IS NOT DISTINCT FROM $3)
         AND project_id IS NOT DISTINCT FROM $4`,
      [conceptId, metadataObject, metadataField || null, projectId || null]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE semantic_mappings
         SET confidence = 1, approved = TRUE, source = 'user_confirmation', updated_at = NOW()
         WHERE id = $1`,
        [existing.rows[0].id]
      );
      trace.action = 'updated';
    } else {
      await pool.query(
        `INSERT INTO semantic_mappings
         (concept_id, metadata_object, metadata_field, mapping_type, confidence, approved, source, project_id, business_term)
         VALUES ($1, $2, $3, $4, 1, TRUE, 'user_confirmation', $5, $6)`,
        [conceptId, metadataObject, metadataField || null, mappingType || 'attribute', projectId || null, term]
      );
      trace.action = 'created';
    }

    // Also update any mcp_discovery mappings for this term to approved
    await pool.query(
      `UPDATE semantic_mappings
       SET approved = TRUE, confidence = GREATEST(confidence, 0.8)
       WHERE concept_id = $1 AND source = 'mcp_discovery' AND project_id IS NOT DISTINCT FROM $2`,
      [conceptId, projectId || null]
    ).catch(() => {});

    console.log(`[SemanticMemoryLearner] Confirmed: "${term}" → ${metadataObject} (project: ${projectId || 'global'})`);

    return { confirmed: true, conceptId, metadataObject, metadataField, projectId, term, trace };
  }

  /**
   * Get all pending (unapproved) MCP discovery suggestions for a project.
   */
  async getPendingSuggestions(projectId) {
    const sql = `
      SELECT sm.id, sm.metadata_object, sm.metadata_field, sm.mapping_type, sm.confidence,
             sm.source, sm.business_term, c.name AS concept_name
      FROM semantic_mappings sm
      JOIN semantic_concepts c ON c.id = sm.concept_id
      WHERE sm.source = 'mcp_discovery'
        AND sm.approved = FALSE
        AND (sm.project_id = $1 OR ($1 IS NULL AND sm.project_id IS NULL))
      ORDER BY sm.confidence DESC
      LIMIT 20
    `;
    const result = await pool.query(sql, [projectId || null]);
    return result.rows;
  }

  // ── Private helpers ────────────────────────────────────────────

  async _checkExistingMapping(term, projectId) {
    const sql = `
      SELECT sm.metadata_object, sm.metadata_field, sm.confidence, sm.source, sm.approved
      FROM semantic_mappings sm
      LEFT JOIN semantic_concepts c ON c.id = sm.concept_id
      WHERE (c.name = $1 OR sm.business_term = $1)
        AND (sm.project_id = $2 OR ($2 IS NULL AND sm.project_id IS NULL))
      ORDER BY sm.approved DESC, sm.confidence DESC
      LIMIT 1
    `;
    const result = await pool.query(sql, [term, projectId || null]);
    if (result.rows.length > 0 && result.rows[0].confidence >= 0.8) {
      return result.rows[0];
    }
    return null;
  }

  _parseMcpResponse(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (Array.isArray(raw.content) && raw.content.length > 0 && typeof raw.content[0].text === 'string') {
      try { return JSON.parse(raw.content[0].text); } catch (_) { return null; }
    }
    return raw;
  }

  _rankCandidates(foundObjects, semanticOperation, term) {
    const termLower = term.toLowerCase();

    // Object type priority based on semantic operation
    const typePriority = {
      document_count:    { 'Документ': 100, 'РегистрНакопления': -30, 'Справочник': 20 },
      document_list:     { 'Документ': 100, 'РегистрНакопления': -30, 'Справочник': 20 },
      stock_balance:     { 'РегистрНакопления': 100, 'Документ': -20, 'Справочник': 10 },
      register_sum:      { 'РегистрНакопления': 100, 'РегистрБухгалтерии': 80 },
      batch_tracking:    { 'РегистрНакопления': 80, 'РегистрСведений': 60 },
      object_create:     { 'Справочник': 60, 'Документ': 60, 'Обработка': 50 },
      object_modify:     { 'Справочник': 60, 'Документ': 60, 'Обработка': 50 },
      code_explanation:  { 'ОбщийМодуль': 80, 'Обработка': 60, 'Документ': 40 },
    };

    const priorities = typePriority[semanticOperation] || {};

    return foundObjects.map(obj => {
      let score = 0;
      const name = (obj.Имя || '').toLowerCase();
      const fullName = (obj.ПолноеИмя || '').toLowerCase();
      const type = obj.Тип || '';

      // Name match scoring
      if (name === termLower || fullName.endsWith('.' + termLower)) {
        score += 100;
      } else if (name.startsWith(termLower) || fullName.includes(termLower)) {
        score += 60;
      } else if (termLower.includes(name) || fullName.includes(termLower.split(' ')[0])) {
        score += 30;
      }

      // Type priority
      const typeScore = priorities[type] || 0;
      score += typeScore;

      // Penalty for technical objects
      if (fullName.includes('присоединенныефайлы') || fullName.includes('versionhistory')) {
        score -= 50;
      }

      obj._score = Math.max(score, 0);
      return obj;
    }).filter(obj => obj._score > 0).sort((a, b) => b._score - a._score);
  }

  _inferMappingType(mcpObject, semanticOperation) {
    const type = mcpObject.Тип || '';
    if (type === 'Документ') return 'document';
    if (type === 'Справочник') return 'catalog';
    if (type.includes('Регистр')) return 'register';
    if (type.includes('Обработка')) return 'processing';
    if (type.includes('Отчет') || type.includes('Отчёт')) return 'report';
    return 'attribute';
  }

  async _persistMapping(term, projectId, mapping) {
    // Find or create concept
    let concept = await pool.query('SELECT id FROM semantic_concepts WHERE name = $1', [term]);
    if (concept.rows.length === 0) {
      concept = await pool.query('INSERT INTO semantic_concepts (name) VALUES ($1) RETURNING id', [term]);
    }
    const conceptId = concept.rows[0].id;

    // Check for existing mapping of same object
    const existing = await pool.query(
      `SELECT id FROM semantic_mappings
       WHERE concept_id = $1 AND metadata_object = $2
         AND (project_id IS NOT DISTINCT FROM $3)`,
      [conceptId, mapping.metadata_object, projectId || null]
    );

    if (existing.rows.length > 0) {
      // Update confidence if this discovery is better
      await pool.query(
        `UPDATE semantic_mappings
         SET confidence = GREATEST(confidence, $1), updated_at = NOW()
         WHERE id = $2`,
        [mapping.confidence, existing.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO semantic_mappings
         (concept_id, metadata_object, metadata_field, mapping_type, confidence, approved, source, project_id, business_term)
         VALUES ($1, $2, $3, $4, $5, FALSE, 'mcp_discovery', $6, $7)`,
        [conceptId, mapping.metadata_object, mapping.metadata_field, mapping.mapping_type, mapping.confidence, projectId || null, term]
      );
    }
  }
}

module.exports = SemanticMemoryLearner;
