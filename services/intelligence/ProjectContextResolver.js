const pool = require('../../db');

class ProjectContextResolver {
  async resolve({ projectId, term }) {
    const trace = {
      stage: 'Project Context',
      projectId,
      term,
      steps: [],
      result: null,
    };

    if (!term) {
      trace.steps.push({ step: 'validate_input', result: 'empty_term' });
      trace.result = { found: false, mappings: [], confidence: 0, source: null, status: 'need_confirmation', suggestion: null };
      console.log('[Project Context]\n  term: (empty)\n  result: empty_term');
      this._lastTrace = trace;
      return trace.result;
    }

    const termLower = term.toLowerCase().trim();

    // Step 1: Search project semantic mappings
    if (projectId) {
      const projectMappings = await this._findProjectMappings(projectId, termLower);
      if (projectMappings.length > 0) {
        const maxConf = Math.max(...projectMappings.map(m => m.confidence));
        trace.steps.push({ step: 'project_mapping_search', result: 'found', count: projectMappings.length, maxConfidence: maxConf });
        trace.result = {
          found: true,
          mappings: projectMappings,
          confidence: maxConf,
          source: 'project_mapping',
          status: maxConf >= 0.8 ? 'resolved' : 'need_confirmation',
          suggestion: maxConf < 0.8 ? this._buildSuggestion(termLower, projectMappings[0]) : null,
        };
        this._logTrace(trace, 'project_mapping');
        this._lastTrace = trace;
        return trace.result;
      }
      trace.steps.push({ step: 'project_mapping_search', result: 'not_found' });
    }

    // Step 2: Search global semantic mappings
    const globalMappings = await this._findGlobalMappings(termLower);
    if (globalMappings.length > 0) {
      const maxConf = Math.max(...globalMappings.map(m => m.confidence));
      trace.steps.push({ step: 'global_mapping_search', result: 'found', count: globalMappings.length, maxConfidence: maxConf });
      trace.result = {
        found: true,
        mappings: globalMappings,
        confidence: maxConf,
        source: 'global_mapping',
        status: maxConf >= 0.8 ? 'resolved' : 'need_confirmation',
        suggestion: maxConf < 0.8 ? this._buildSuggestion(termLower, globalMappings[0]) : null,
      };
      this._logTrace(trace, 'global_mapping');
      this._lastTrace = trace;
      return trace.result;
    }
    trace.steps.push({ step: 'global_mapping_search', result: 'not_found' });

    // Step 3: Search project RAG knowledge
    if (projectId) {
      const ragResult = await this._searchRagKnowledge(projectId, termLower);
      if (ragResult.found) {
        trace.steps.push({ step: 'rag_fallback', result: 'found', snippet: ragResult.snippet });
        trace.result = {
          found: true,
          mappings: ragResult.mappings,
          confidence: 0.6,
          source: 'rag_fallback',
          status: 'need_confirmation',
          suggestion: this._buildSuggestion(termLower, ragResult.mappings[0], 'RAG'),
        };
        this._logTrace(trace, 'rag');
        this._lastTrace = trace;
        return trace.result;
      }
      trace.steps.push({ step: 'rag_fallback', result: 'not_found' });
    }

    // Step 4: No data found — learning mode
    trace.steps.push({ step: 'learning_mode', result: 'unknown_term' });
    trace.result = {
      found: false,
      mappings: [],
      confidence: 0,
      source: null,
      status: 'need_confirmation',
      suggestion: {
        term: termLower,
        mapping: null,
        confidence: 0,
        message: `Я не знаю, что означает "${termLower}" в этой конфигурации 1С. Пожалуйста, укажите объект метаданных.`,
      },
    };
    this._logTrace(trace, 'learning_mode');
    this._lastTrace = trace;
    return trace.result;
  }

  async _findProjectMappings(projectId, term) {
    const result = await pool.query(
      `SELECT sm.id, sm.concept_id, sm.metadata_object, sm.metadata_field,
              sm.mapping_type, sm.confidence, sm.approved, sm.source,
              c.name AS concept_name
       FROM semantic_mappings sm
       LEFT JOIN semantic_concepts c ON c.id = sm.concept_id
       WHERE sm.project_id = $1
         AND (c.name = $2 OR sm.business_term = $2)
       ORDER BY sm.confidence DESC, sm.approved DESC
       LIMIT 5`,
      [projectId, term]
    );

    if (result.rows.length > 0) return result.rows;

    const aliasResult = await pool.query(
      `SELECT sm.id, sm.concept_id, sm.metadata_object, sm.metadata_field,
              sm.mapping_type, sm.confidence, sm.approved, sm.source,
              c.name AS concept_name
       FROM semantic_aliases a
       JOIN semantic_concepts c ON c.id = a.concept_id
       JOIN semantic_mappings sm ON sm.concept_id = c.id
       WHERE sm.project_id = $1 AND a.alias = $2
       ORDER BY sm.confidence DESC, sm.approved DESC
       LIMIT 5`,
      [projectId, term]
    );

    return aliasResult.rows;
  }

  async _findGlobalMappings(term) {
    const result = await pool.query(
      `SELECT sm.id, sm.concept_id, sm.metadata_object, sm.metadata_field,
              sm.mapping_type, sm.confidence, sm.approved, sm.source,
              c.name AS concept_name
       FROM semantic_mappings sm
       LEFT JOIN semantic_concepts c ON c.id = sm.concept_id
       WHERE sm.project_id IS NULL
         AND (c.name = $1 OR sm.business_term = $1)
       ORDER BY sm.confidence DESC, sm.approved DESC
       LIMIT 5`,
      [term]
    );

    if (result.rows.length > 0) return result.rows;

    const aliasResult = await pool.query(
      `SELECT sm.id, sm.concept_id, sm.metadata_object, sm.metadata_field,
              sm.mapping_type, sm.confidence, sm.approved, sm.source,
              c.name AS concept_name
       FROM semantic_aliases a
       JOIN semantic_concepts c ON c.id = a.concept_id
       JOIN semantic_mappings sm ON sm.concept_id = c.id
       WHERE sm.project_id IS NULL AND a.alias = $1
       ORDER BY sm.confidence DESC, sm.approved DESC
       LIMIT 5`,
      [term]
    );

    return aliasResult.rows;
  }

  async _searchRagKnowledge(projectId, term) {
    try {
      const result = await pool.query(
        `SELECT content FROM document_embeddings
         WHERE project_id = $1
           AND content ILIKE '%' || $2 || '%'
         LIMIT 1`,
        [projectId, term]
      );

      if (result.rows.length === 0) {
        const msgResult = await pool.query(
          `SELECT content FROM message_embeddings
           WHERE project_id = $1
             AND content ILIKE '%' || $2 || '%'
           LIMIT 1`,
          [projectId, term]
        );
        if (msgResult.rows.length === 0) return { found: false };
        return this._parseRagContent(msgResult.rows[0].content, term);
      }

      return this._parseRagContent(result.rows[0].content, term);
    } catch (err) {
      console.log(`[ProjectContext] RAG search error: ${err.message}`);
      return { found: false };
    }
  }

  _parseRagContent(content, term) {
    const objPattern = /(Справочник|Документ|РегистрНакопления|РегистрСведений|РегистрБухгалтерии|Перечисление|ПланВидовХарактеристик)[.\s][^\s.]+/gi;
    const objects = content.match(objPattern);
    if (objects && objects.length > 0) {
      const fieldPattern = new RegExp(`(ДополнительныеРеквизиты|Реквизиты)[.\\s]${term}`, 'i');
      const fieldMatch = content.match(fieldPattern);
      return {
        found: true,
        snippet: content.substring(0, 500),
        mappings: [{
          id: null,
          concept_name: term,
          metadata_object: objects[0].trim(),
          metadata_field: fieldMatch ? fieldMatch[0] : null,
          mapping_type: 'rag_suggestion',
          confidence: 0.6,
          approved: false,
          source: 'rag_fallback',
        }],
      };
    }
    return { found: false };
  }

  _buildSuggestion(term, mapping, sourceLabel) {
    const fieldPart = mapping.metadata_field ? `.${mapping.metadata_field}` : '';
    const label = sourceLabel ? ` (на основе ${sourceLabel})` : '';
    return {
      term,
      mapping: `${mapping.metadata_object}${fieldPart}`,
      confidence: mapping.confidence,
      message: `Я предполагаю, что "${term}" хранится в ${mapping.metadata_object}${fieldPart}. Подтвердить?${label ? ' ' + label : ''}`,
    };
  }

  async confirmMapping({ projectId, term, metadataObject, metadataField, mappingType }) {
    let concept = await pool.query('SELECT id FROM semantic_concepts WHERE name = $1', [term]);
    if (concept.rows.length === 0) {
      concept = await pool.query(
        'INSERT INTO semantic_concepts (name) VALUES ($1) RETURNING id',
        [term]
      );
    }
    const conceptId = concept.rows[0].id;

    const existing = await pool.query(
      `SELECT id FROM semantic_mappings
       WHERE concept_id = $1 AND metadata_object = $2
         AND (metadata_field IS NOT DISTINCT FROM $3)
         AND project_id IS NOT DISTINCT FROM $4`,
      [conceptId, metadataObject, metadataField, projectId || null]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE semantic_mappings SET confidence = 1, approved = TRUE,
         source = 'user_confirmation', updated_at = NOW()
         WHERE id = $1`,
        [existing.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO semantic_mappings (concept_id, metadata_object, metadata_field,
         mapping_type, confidence, approved, source, project_id, business_term)
         VALUES ($1, $2, $3, $4, 1, TRUE, 'user_confirmation', $5, $6)`,
        [conceptId, metadataObject, metadataField, mappingType || 'attribute', projectId || null, term]
      );
    }

    console.log(`[ProjectContext] Mapping confirmed: ${term} → ${metadataObject}.${metadataField || ''} (project: ${projectId || 'global'})`);

    return { confirmed: true, conceptId, metadataObject, metadataField, projectId, term };
  }

  _logTrace(trace, source) {
    console.log('[Project Context]');
    console.log(`  project: ${trace.projectId || 'global'}`);
    console.log(`  term: ${trace.term}`);
    console.log(`  source: ${source}`);
    if (trace.result && trace.result.mappings && trace.result.mappings.length > 0) {
      const m = trace.result.mappings[0];
      console.log(`  mapping: ${m.metadata_object}${m.metadata_field ? '.' + m.metadata_field : ''}`);
      console.log(`  confidence: ${trace.result.confidence}`);
    } else {
      console.log(`  mapping not found`);
      console.log(`  fallback: rag`);
    }
  }

  getLastTrace() {
    return this._lastTrace || null;
  }
}

module.exports = ProjectContextResolver;