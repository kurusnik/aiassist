const pool = require('../../db');
const { vectorSearch, hybridSearch } = require('../rag/search');

const SOURCE_PRIORITY = [
  'user_confirmation',
  'project_mapping',
  'semantic_memory',
  'project_rag',
  'global_rag',
];

class SemanticKnowledgeFusion {
  constructor() {
    this._trace = null;
  }

  async resolve({ projectId, term, context }) {
    const trace = {
      stage: 'Semantic Fusion',
      term,
      projectId,
      sources: [],
      selected: null,
      confidence: 0,
    };

    if (!term) {
      trace.result = this._emptyResult('empty_term');
      this._logTrace(trace);
      this._trace = trace;
      return trace.result;
    }

    const termLower = term.toLowerCase().trim();
    const allSources = [];

    // 1. user_confirmation mappings
    const userConfirmed = await this._findBySource(termLower, projectId, 'user_confirmation');
    if (userConfirmed.length > 0) {
      allSources.push({ type: 'user_confirmation', confidence: 1, mappings: userConfirmed });
    }

    // 2. project semantic mappings (non-user_confirmation)
    const projectMappings = await this._findBySource(termLower, projectId, 'project_mapping', ['user_confirmation']);
    if (projectMappings.length > 0) {
      allSources.push({ type: 'project_mapping', confidence: projectMappings[0].confidence, mappings: projectMappings });
    }

    // 3. semantic_memory (global, non-user_confirmation)
    const globalMappings = await this._findBySource(termLower, null, 'global', ['user_confirmation']);
    if (globalMappings.length > 0) {
      allSources.push({ type: 'semantic_memory', confidence: globalMappings[0].confidence, mappings: globalMappings });
    }

    // 4. Project RAG (vector search on project documents)
    if (projectId) {
      const projectRag = await this._searchProjectRag(projectId, termLower, context);
      if (projectRag.mappings.length > 0) {
        allSources.push({ type: 'project_rag', confidence: projectRag.confidence, mappings: projectRag.mappings, explanation: projectRag.explanation });
      }
    }

    // 5. Global RAG (public knowledge base)
    const globalRag = await this._searchGlobalRag(termLower, context);
    if (globalRag.mappings.length > 0) {
      allSources.push({ type: 'global_rag', confidence: globalRag.confidence, mappings: globalRag.mappings, explanation: globalRag.explanation });
    }

    trace.sources = allSources.map(s => ({ type: s.type, confidence: s.confidence, count: s.mappings.length }));

    const bestSource = this._selectBestSource(allSources);

    if (bestSource) {
      const bestMapping = bestSource.mappings[0];
      trace.selected = {
        source: bestSource.type,
        mapping: `${bestMapping.metadata_object}${bestMapping.metadata_field ? '.' + bestMapping.metadata_field : ''}`,
        confidence: bestSource.confidence,
      };
      trace.confidence = bestSource.confidence;

      const concepts = await this._resolveConcepts(bestSource.mappings);

      const result = {
        term: termLower,
        sources: allSources.map(s => ({ type: s.type, confidence: s.confidence, mappings: s.mappings })),
        selectedSource: bestSource.type,
        concepts,
        suggestedMappings: bestSource.mappings,
        confidence: bestSource.confidence,
        explanation: bestSource.explanation || null,
        status: bestSource.confidence >= 0.8 ? 'resolved' : 'need_confirmation',
      };

      trace.result = result;
      this._logTrace(trace);
      this._trace = trace;
      return result;
    }

    // 6. Fallback — learning mode
    const result = {
      term: termLower,
      sources: [],
      selectedSource: null,
      concepts: [],
      suggestedMappings: [],
      confidence: 0,
      explanation: null,
      status: 'need_confirmation',
    };

    trace.result = result;
    trace.selected = null;
    trace.confidence = 0;
    this._logTrace(trace);
    this._trace = trace;
    return result;
  }

  async _findBySource(term, projectId, source, excludeSources) {
    try {
      let rows = [];

      if (source === 'user_confirmation') {
        const sql = projectId
          ? `SELECT sm.id, sm.concept_id, sm.metadata_object, sm.metadata_field,
                    sm.mapping_type, sm.confidence, sm.approved, sm.source,
                    c.name AS concept_name
             FROM semantic_mappings sm
             LEFT JOIN semantic_concepts c ON c.id = sm.concept_id
             WHERE (c.name = $2 OR sm.business_term = $2)
               AND (sm.project_id = $1 OR sm.project_id IS NULL)
               AND sm.source = 'user_confirmation'
             ORDER BY sm.confidence DESC, sm.approved DESC
             LIMIT 5`
          : `SELECT sm.id, sm.concept_id, sm.metadata_object, sm.metadata_field,
                    sm.mapping_type, sm.confidence, sm.approved, sm.source,
                    c.name AS concept_name
             FROM semantic_mappings sm
             LEFT JOIN semantic_concepts c ON c.id = sm.concept_id
             WHERE (c.name = $1 OR sm.business_term = $1)
               AND sm.project_id IS NULL
               AND sm.source = 'user_confirmation'
             ORDER BY sm.confidence DESC, sm.approved DESC
             LIMIT 5`;
        const params = projectId ? [projectId, term] : [term];
        const result = await pool.query(sql, params);
        rows = result.rows;
      }

      if (source === 'project_mapping') {
        const sql = `SELECT sm.id, sm.concept_id, sm.metadata_object, sm.metadata_field,
                            sm.mapping_type, sm.confidence, sm.approved, sm.source,
                            c.name AS concept_name
                     FROM semantic_mappings sm
                     LEFT JOIN semantic_concepts c ON c.id = sm.concept_id
                     WHERE (c.name = $2 OR sm.business_term = $2)
                       AND sm.project_id = $1
                       AND (sm.source IS NULL OR sm.source = '' OR sm.source = 'project_mapping')
                     ORDER BY sm.confidence DESC, sm.approved DESC
                     LIMIT 5`;
        const result = await pool.query(sql, [projectId, term]);
        rows = result.rows;
      }

      if (source === 'global') {
        const sql = `SELECT sm.id, sm.concept_id, sm.metadata_object, sm.metadata_field,
                            sm.mapping_type, sm.confidence, sm.approved, sm.source,
                            c.name AS concept_name
                     FROM semantic_mappings sm
                     LEFT JOIN semantic_concepts c ON c.id = sm.concept_id
                     WHERE (c.name = $1 OR sm.business_term = $1)
                       AND sm.project_id IS NULL
                       AND (sm.source IS NULL OR sm.source = '' OR sm.source = 'global')
                     ORDER BY sm.confidence DESC, sm.approved DESC
                     LIMIT 5`;
        const result = await pool.query(sql, [term]);
        rows = result.rows;
      }

      if (excludeSources && excludeSources.length > 0) {
        rows = rows.filter(r => !excludeSources.includes(r.source));
      }

      if (rows.length > 0) return rows;

      const aliasSql = source === 'user_confirmation'
        ? (projectId
            ? `SELECT sm.id, sm.concept_id, sm.metadata_object, sm.metadata_field,
                      sm.mapping_type, sm.confidence, sm.approved, sm.source,
                      c.name AS concept_name
               FROM semantic_aliases a
               JOIN semantic_concepts c ON c.id = a.concept_id
               JOIN semantic_mappings sm ON sm.concept_id = c.id
               WHERE a.alias = $2
                 AND (sm.project_id = $1 OR sm.project_id IS NULL)
                 AND sm.source = 'user_confirmation'
               ORDER BY sm.confidence DESC, sm.approved DESC
               LIMIT 5`
            : `SELECT sm.id, sm.concept_id, sm.metadata_object, sm.metadata_field,
                      sm.mapping_type, sm.confidence, sm.approved, sm.source,
                      c.name AS concept_name
               FROM semantic_aliases a
               JOIN semantic_concepts c ON c.id = a.concept_id
               JOIN semantic_mappings sm ON sm.concept_id = c.id
               WHERE a.alias = $1
                 AND sm.project_id IS NULL
                 AND sm.source = 'user_confirmation'
               ORDER BY sm.confidence DESC, sm.approved DESC
               LIMIT 5`)
        : (source === 'project_mapping'
            ? `SELECT sm.id, sm.concept_id, sm.metadata_object, sm.metadata_field,
                      sm.mapping_type, sm.confidence, sm.approved, sm.source,
                      c.name AS concept_name
               FROM semantic_aliases a
               JOIN semantic_concepts c ON c.id = a.concept_id
               JOIN semantic_mappings sm ON sm.concept_id = c.id
               WHERE a.alias = $2
                 AND sm.project_id = $1
                 AND (sm.source IS NULL OR sm.source = '' OR sm.source = 'project_mapping')
               ORDER BY sm.confidence DESC, sm.approved DESC
               LIMIT 5`
            : `SELECT sm.id, sm.concept_id, sm.metadata_object, sm.metadata_field,
                      sm.mapping_type, sm.confidence, sm.approved, sm.source,
                      c.name AS concept_name
               FROM semantic_aliases a
               JOIN semantic_concepts c ON c.id = a.concept_id
               JOIN semantic_mappings sm ON sm.concept_id = c.id
               WHERE a.alias = $1
                 AND sm.project_id IS NULL
                 AND (sm.source IS NULL OR sm.source = '' OR sm.source = 'global')
               ORDER BY sm.confidence DESC, sm.approved DESC
               LIMIT 5`);

      const aliasParams = (source === 'user_confirmation' || source === 'project_mapping') && projectId
        ? [projectId, term] : [term];
      const aliasResult = await pool.query(aliasSql, aliasParams);
      let aliasRows = aliasResult.rows;

      if (excludeSources && excludeSources.length > 0) {
        aliasRows = aliasRows.filter(r => !excludeSources.includes(r.source));
      }

      return aliasRows;
    } catch (err) {
      console.log(`[SemanticFusion] _findBySource error (${source}): ${err.message}`);
      return [];
    }
  }

  async _searchProjectRag(projectId, term, context) {
    try {
      const ragResults = await this._vectorSearchRag(term, { projectId, limit: 3, threshold: 0.5 });
      if (ragResults.length > 0) {
        return this._parseRagResults(ragResults, term, 'project_rag');
      }

      const hybridResults = await this._hybridSearchRag(term, { projectId, limit: 3, threshold: 0.3 });
      if (hybridResults.length > 0) {
        return this._parseRagResults(hybridResults, term, 'project_rag');
      }

      return { mappings: [], confidence: 0, explanation: null };
    } catch (err) {
      console.log(`[SemanticFusion] _searchProjectRag error: ${err.message}`);
      return { mappings: [], confidence: 0, explanation: null };
    }
  }

  async _searchGlobalRag(term, context) {
    try {
      const ragResults = await this._vectorSearchRag(term, { limit: 3, threshold: 0.5 });
      if (ragResults.length > 0) {
        return this._parseRagResults(ragResults, term, 'global_rag');
      }
      return { mappings: [], confidence: 0, explanation: null };
    } catch (err) {
      console.log(`[SemanticFusion] _searchGlobalRag error: ${err.message}`);
      return { mappings: [], confidence: 0, explanation: null };
    }
  }

  async _vectorSearchRag(query, options) {
    try {
      return await vectorSearch(query, options);
    } catch (err) {
      return [];
    }
  }

  async _hybridSearchRag(query, options) {
    try {
      return await hybridSearch(query, options);
    } catch (err) {
      return [];
    }
  }

  _parseRagResults(ragResults, term, sourceType) {
    const mappings = [];
    const explanations = [];

    for (const doc of ragResults) {
      const parsed = this._extractMappingFromText(doc.content, term);
      if (parsed) {
        mappings.push(parsed);
        explanations.push(doc.content.substring(0, 200));
      }
    }

    if (mappings.length > 0) {
      return {
        mappings,
        confidence: 0.7,
        explanation: explanations[0] || null,
      };
    }

    return { mappings: [], confidence: 0, explanation: null };
  }

  _extractMappingFromText(content, term) {
    const objPattern = /(Справочник|Документ|РегистрНакопления|РегистрСведений|РегистрБухгалтерии|Перечисление|ПланВидовХарактеристик)[.\s][^\s.]+/gi;
    const objects = content.match(objPattern);

    if (objects && objects.length > 0) {
      const fieldPattern = new RegExp(`(ДополнительныеРеквизиты|Реквизиты|Свойство)[.\\s][^\\s.]+`, 'gi');
      const fieldMatch = content.match(fieldPattern);

      return {
        id: null,
        concept_name: term,
        metadata_object: objects[0].trim(),
        metadata_field: fieldMatch ? fieldMatch[0] : null,
        mapping_type: 'rag_suggestion',
        confidence: 0.7,
        approved: false,
        source: 'rag_fallback',
      };
    }

    return null;
  }

  async _resolveConcepts(mappings) {
    const conceptIds = mappings.filter(m => m.concept_id).map(m => m.concept_id);
    if (conceptIds.length === 0) {
      return mappings.map(m => ({ name: m.concept_name || 'unknown', confidence: m.confidence }));
    }

    try {
      const result = await pool.query(
        'SELECT id, name FROM semantic_concepts WHERE id = ANY($1)',
        [conceptIds]
      );
      return result.rows.map(r => ({ name: r.name, confidence: 0.8 }));
    } catch (err) {
      return mappings.map(m => ({ name: m.concept_name || 'unknown', confidence: m.confidence }));
    }
  }

  _selectBestSource(sources) {
    if (sources.length === 0) return null;

    for (const priority of SOURCE_PRIORITY) {
      const match = sources.find(s => s.type === priority && s.mappings.length > 0);
      if (match) return match;
    }

    return sources.sort((a, b) => b.confidence - a.confidence)[0];
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

    console.log(`[SemanticFusion] Mapping confirmed: ${term} → ${metadataObject}.${metadataField || ''} (project: ${projectId || 'global'})`);

    return { confirmed: true, conceptId, metadataObject, metadataField, projectId, term };
  }

  _emptyResult(reason) {
    return {
      term: null,
      sources: [],
      selectedSource: null,
      concepts: [],
      suggestedMappings: [],
      confidence: 0,
      explanation: null,
      status: 'need_confirmation',
    };
  }

  _logTrace(trace) {
    console.log('[Semantic Fusion]');
    console.log(`  term: ${trace.term}`);
    console.log(`  sources:`);
    for (const s of trace.sources) {
      console.log(`    ${s.type}: ${s.confidence > 0 ? 'found (confidence: ' + s.confidence + ')' : 'none'}`);
    }
    if (trace.selected) {
      console.log(`  selected: ${trace.selected.mapping}`);
      console.log(`  confidence: ${trace.selected.confidence}`);
    } else {
      console.log(`  selected: none`);
      console.log(`  confidence: 0`);
    }
  }

  getLastTrace() {
    return this._trace || null;
  }
}

module.exports = SemanticKnowledgeFusion;