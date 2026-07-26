const pool = require('../../db');
const SemanticKnowledgeFusion = require('./SemanticKnowledgeFusion');

const STOP_WORDS = new Set(['по', 'в', 'на', 'из', 'за', 'с', 'от', 'к', 'для', 'и', 'а', 'но', 'или', 'не', 'ни', 'во', 'об', 'о', 'у', 'при', 'без', 'до', 'про']);

const BUSINESS_CONCEPT_MAP = {
  sales_analysis: { dimensions: ['Номенклатура', 'Бренд'], resources: ['Сумма'] },
  stock_balance: { dimensions: ['Номенклатура', 'Склад', 'Партия'], resources: ['Количество'] },
  sales_by_customer: { dimensions: ['Контрагент'], resources: ['Сумма'] },
  batch_tracking: { dimensions: ['Номенклатура', 'Партия', 'Серия', 'СрокГодности'], resources: ['Количество'] },
  cost_analysis: { dimensions: ['Номенклатура', 'Партия'], resources: ['Себестоимость'] },
};

class OneCSemanticTranslator {
  constructor() {
    this._knowledgeFusion = new SemanticKnowledgeFusion();
  }

  _splitEntity(entity) {
    return entity.toLowerCase().trim().split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.has(w));
  }
  async translate(input, context) {
    if (!input || !input.entity) {
      const emptyTrace = { stage: 'Semantic Translator', steps: [{ step: 'validate_input', result: 'empty_input' }], output: null };
      return { businessConcept: null, resolvedEntities: [], mappings: [], relations: [], confidence: 0, trace: emptyTrace };
    }

    const trace = {
      stage: 'Semantic Translator',
      input: { entity: input.entity, operation: input.semanticOperation },
      steps: [],
      output: null,
    };

    const rawEntity = input.entity.toLowerCase().trim();
    const operation = input.semanticOperation || 'unknown';
    const tokens = this._splitEntity(input.entity);
    const projectId = context && context.projectId ? context.projectId : null;

    trace.steps.push({ step: 'entity_split', tokens });
    trace.steps.push({ step: 'memory_lookup', query: rawEntity, tokens });

    let fusionResult = null;
    if (projectId) {
      trace.steps.push({ step: 'knowledge_fusion', projectId });
      for (const token of [...new Set([rawEntity, ...tokens])]) {
        let fusion;
        try {
          fusion = await this._knowledgeFusion.resolve({ projectId, term: token, context: { operation } });
        } catch (fusError) {
          trace.steps.push({ step: 'knowledge_fusion_error', term: token, error: fusError.message });
          continue;
        }
        if (fusion.selectedSource && fusion.suggestedMappings.length > 0) {
          if (fusion.confidence >= 0.8) {
            fusionResult = fusion;
            trace.steps.push({ step: 'knowledge_fusion', term: token, source: fusion.selectedSource,
              confidence: fusion.confidence,
              mapping: fusion.suggestedMappings[0].metadata_object +
                (fusion.suggestedMappings[0].metadata_field ? '.' + fusion.suggestedMappings[0].metadata_field : '') });
            break;
          }
          fusionResult = fusion;
          trace.steps.push({ step: 'knowledge_fusion_low_confidence', term: token, source: fusion.selectedSource,
            confidence: fusion.confidence });
        }
      }
      if (!fusionResult) {
        trace.steps.push({ step: 'knowledge_fusion', result: 'not_found' });
      }
    }

    const allConcepts = [];
    const allMappings = [];
    const seenConceptIds = new Set();

    const fullAliasConcept = await this._lookupConcept(rawEntity);
    if (fullAliasConcept && !seenConceptIds.has(fullAliasConcept.id)) {
      seenConceptIds.add(fullAliasConcept.id);
      allConcepts.push(fullAliasConcept);
      trace.steps.push({ step: 'memory_lookup', token: rawEntity, result: 'found', concept: fullAliasConcept.name, confidence: fullAliasConcept.confidence });

      const mappings = await this._lookupMappings([fullAliasConcept.id]);
      allMappings.push(...mappings);
    }

    if (allMappings.length === 0) {
      for (const token of tokens) {
        const concept = await this._lookupConcept(token);
        if (concept && !seenConceptIds.has(concept.id)) {
          seenConceptIds.add(concept.id);
          allConcepts.push(concept);
          trace.steps.push({ step: 'memory_lookup', token, result: 'found', concept: concept.name, confidence: concept.confidence });

          const mappings = await this._lookupMappings([concept.id]);
          allMappings.push(...mappings);
        } else if (!concept) {
          trace.steps.push({ step: 'memory_lookup', token, result: 'not_found' });
        }
      }
    }

    if (allMappings.length === 0 && tokens.length > 0) {
      const firstToken = tokens[0];
      trace.steps.push({ step: 'fallback_scoring', token: firstToken });
      const fallback = await this._fallbackScoring(firstToken, operation);
      allMappings.push(...fallback);
    }

    if (fusionResult && fusionResult.selectedSource && fusionResult.suggestedMappings.length > 0) {
      const fusionMappings = fusionResult.suggestedMappings.map(m => ({
        ...m,
        _fusionSource: fusionResult.selectedSource,
      }));
      allMappings.unshift(...fusionMappings);
      trace.steps.push({ step: 'knowledge_fusion_injected', count: fusionMappings.length,
        source: fusionResult.selectedSource, confidence: fusionResult.confidence });
    }

    trace.steps.push({ step: 'candidate_ranking', candidates: allMappings.map(c => ({ object: c.metadata_object, field: c.metadata_field, confidence: c.confidence })) });

    const exampleToken = tokens.join(' ');
    const example = await this._lookupExample(rawEntity);
    if (example) {
      trace.steps.push({ step: 'example_match', matched: example.question, confidence: example.confidence });
    }

    const resolvedEntities = allMappings.map(c => {
      const conceptObj = c.concept_id ? allConcepts.find(con => con.id === c.concept_id) : null;
      return {
        concept: conceptObj ? conceptObj.name : (c.concept_name || tokens[0]),
        object: c.metadata_object,
        field: c.metadata_field || null,
        confidence: c.confidence,
      };
    });

    const relations = this._resolveRelations(resolvedEntities);
    const joinedEntity = tokens.join(' ');
    const businessConcept = this._inferBusinessConcept(operation, joinedEntity, resolvedEntities);
    const confidence = this._computeConfidence(resolvedEntities, allConcepts, example);
    const dimensions = this._extractDimensions(businessConcept, resolvedEntities);

    const result = {
      businessConcept,
      resolvedEntities,
      mappings: allMappings,
      relations,
      confidence,
      dimensions,
      trace,
    };

    trace.output = {
      businessConcept,
      resolvedEntities: resolvedEntities.map(e => ({ concept: e.concept, object: e.object, field: e.field, confidence: e.confidence })),
      relations,
      confidence,
    };

    console.log('[Semantic Translator]');
    console.log(`  input: ${JSON.stringify({ entity: input.entity, operation: input.semanticOperation })}`);
    console.log(`  tokens: ${JSON.stringify(tokens)}`);
    console.log(`  concepts found: ${allConcepts.length > 0 ? allConcepts.map(c => c.name).join(', ') : 'nothing'}`);
    console.log(`  fusion: ${fusionResult ? fusionResult.selectedSource + ' (confidence: ' + fusionResult.confidence + ')' : 'none'}`);
    console.log(`  confidence: ${confidence}`);
    console.log(`  output: ${JSON.stringify(trace.output)}`);

    this._lastTrace = trace;
    this._lastResult = result;

    return result;
  }

  async _lookupConcept(entity) {
    const conceptResult = await pool.query(
      `SELECT c.id, c.name, COALESCE(m.avg_conf, 0.8) AS confidence
       FROM semantic_concepts c
       LEFT JOIN (SELECT concept_id, AVG(confidence) AS avg_conf FROM semantic_mappings WHERE approved = TRUE GROUP BY concept_id) m ON m.concept_id = c.id
       WHERE c.name = $1`,
      [entity]
    );
    if (conceptResult.rows.length > 0) {
      return conceptResult.rows[0];
    }

    const aliasResult = await pool.query(
      `SELECT c.id, c.name, COALESCE(m.avg_conf, 0.7) AS confidence
       FROM semantic_aliases a
       JOIN semantic_concepts c ON c.id = a.concept_id
       LEFT JOIN (SELECT concept_id, AVG(confidence) AS avg_conf FROM semantic_mappings WHERE approved = TRUE GROUP BY concept_id) m ON m.concept_id = c.id
       WHERE a.alias = $1`,
      [entity]
    );
    if (aliasResult.rows.length > 0) {
      return aliasResult.rows[0];
    }

    if (entity.includes(' ')) {
      return null;
    }

    const likeResult = await pool.query(
      `SELECT c.id, c.name, COALESCE(m.avg_conf, 0.6) AS confidence
       FROM semantic_concepts c
       LEFT JOIN (SELECT concept_id, AVG(confidence) AS avg_conf FROM semantic_mappings WHERE approved = TRUE GROUP BY concept_id) m ON m.concept_id = c.id
       WHERE $1 LIKE '%' || c.name || '%' OR c.name LIKE '%' || $1 || '%'
       LIMIT 1`,
      [entity]
    );
    if (likeResult.rows.length > 0) {
      return likeResult.rows[0];
    }

    return null;
  }

  async _lookupMappings(conceptIds) {
    if (!conceptIds || conceptIds.length === 0) return [];
    const result = await pool.query(
      `SELECT id, concept_id, metadata_object, metadata_field, mapping_type, confidence, approved
       FROM semantic_mappings
       WHERE concept_id = ANY($1)
       ORDER BY approved DESC, confidence DESC`,
      [conceptIds]
    );
    return result.rows;
  }

  async _lookupExample(textParam) {
    if (!textParam) return null;
    const text = textParam.toLowerCase().trim();
    const result = await pool.query(
      `SELECT id, question, resolved_plan, approved, confidence
       FROM semantic_examples
       WHERE approved = TRUE AND to_tsvector('russian', question) @@ plainto_tsquery('russian', $1)
       LIMIT 1`,
      [text]
    );
    if (result.rows.length > 0) {
      return { ...result.rows[0], confidence: 0.95 };
    }

    const likeResult = await pool.query(
      `SELECT id, question, resolved_plan, approved
       FROM semantic_examples
       WHERE approved = TRUE AND ($1 LIKE '%' || question || '%' OR question LIKE '%' || $1 || '%')
       LIMIT 1`,
      [text]
    );
    if (likeResult.rows.length > 0) {
      return { ...likeResult.rows[0], confidence: 0.85 };
    }

    return null;
  }

  async _fallbackScoring(entity, operation) {
    const candidates = [];
    const prefix = operation === 'stock_balance' || operation === 'register_sum' ? 'РегистрНакопления' :
      operation === 'document_count' || operation === 'document_list' ? 'Документ' : null;

    if (prefix) {
      const result = await pool.query(
        `SELECT metadata_object, metadata_field, mapping_type, confidence
         FROM semantic_mappings
         WHERE metadata_object LIKE $1 || '.%'
         ORDER BY confidence DESC
         LIMIT 3`,
        [prefix]
      );
      candidates.push(...result.rows.map(r => ({ ...r, concept_id: null, approved: false })));
    }

    if (candidates.length === 0) {
      const result = await pool.query(
        `SELECT metadata_object, metadata_field, mapping_type, confidence
         FROM semantic_mappings
         WHERE metadata_object ILIKE '%' || $1 || '%'
         ORDER BY confidence DESC
         LIMIT 3`,
        [entity]
      );
      candidates.push(...result.rows.map(r => ({ ...r, concept_id: null, approved: false })));
    }

    if (candidates.length === 0) {
      candidates.push({
        concept_id: null,
        metadata_object: prefix || 'Справочник.' + entity.charAt(0).toUpperCase() + entity.slice(1),
        metadata_field: null,
        mapping_type: 'catalog',
        confidence: 0.5,
        approved: false,
      });
    }

    return candidates;
  }

  _resolveRelations(entities) {
    if (!entities || entities.length < 2) return [];
    const relations = [];
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i];
        const b = entities[j];
        const aParts = a.object ? a.object.split('.') : [];
        const bParts = b.object ? b.object.split('.') : [];
        if (aParts.length >= 2 && bParts.length >= 2) {
          relations.push({
            from: a.object + (a.field ? '.' + a.field : ''),
            to: bParts[bParts.length - 1],
            relation: 'reference',
          });
        }
      }
    }
    return relations;
  }

  _inferBusinessConcept(operation, entity, entities) {
    if (entity && entity.includes('продаж') && entity.includes('бренд')) return 'sales_analysis';
    if (entity && entity.includes('остат') && entity.includes('парт')) return 'stock_balance';
    if (entity && entity.includes('клиент') && entity.includes('продаж')) return 'sales_by_customer';
    if (entity && entity.includes('остат')) return 'stock_balance';
    if (entity && entity.includes('продаж')) return 'sales_analysis';
    if (entity && entity.includes('себестоим')) return 'cost_analysis';
    if (operation === 'stock_balance') return 'stock_balance';
    if (operation === 'document_count') return 'sales_analysis';
    if (operation === 'register_sum') return 'sales_analysis';
    return 'data_query';
  }

  _computeConfidence(entities, concepts, example) {
    if (!entities || entities.length === 0) return 0;
    const entityConfAvg = entities.reduce((s, e) => s + e.confidence, 0) / entities.length;
    const conceptBonus = concepts && concepts.length > 0 ? 0.1 : 0;
    const exampleBonus = example ? 0.15 : 0;
    const approvedCount = entities.filter(e => e.confidence >= 0.9).length;
    const approvedBonus = Math.min(approvedCount * 0.05, 0.15);
    const raw = entityConfAvg * 0.6 + conceptBonus + exampleBonus + approvedBonus;
    return Math.round(Math.min(raw, 1) * 100) / 100;
  }

  _extractDimensions(businessConcept, entities) {
    const conceptDims = BUSINESS_CONCEPT_MAP[businessConcept];
    if (conceptDims) return conceptDims;

    const dims = { dimensions: [], resources: ['Количество'] };
    for (const e of entities) {
      if (e.field) {
        dims.dimensions.push(e.field.split('.').pop());
      } else {
        const parts = (e.object || '').split('.');
        if (parts.length >= 2) dims.dimensions.push(parts[parts.length - 1]);
      }
    }
    return dims;
  }

  suggestConfirmation(result) {
    if (!result || result.confidence >= 0.8) return null;
    const entities = result.resolvedEntities || [];
    if (entities.length === 0) return null;

    const suggestions = entities.map(e => {
      const fieldPart = e.field ? '.' + e.field : '';
      return `${e.concept} → ${e.object}${fieldPart}`;
    });

    return {
      message: 'Я предполагаю связь:\n' + suggestions.join('\n') + '\n\nПодтвердить?',
      needsConfirmation: true,
      suggestions,
      result,
    };
  }

  async confirmMapping(conceptName, metadataObject, metadataField, mappingType) {
    let concept = await pool.query('SELECT id FROM semantic_concepts WHERE name = $1', [conceptName]);
    if (concept.rows.length === 0) {
      concept = await pool.query(
        'INSERT INTO semantic_concepts (name) VALUES ($1) RETURNING id',
        [conceptName]
      );
    }
    const conceptId = concept.rows[0].id;

    const existing = await pool.query(
      `SELECT id FROM semantic_mappings
       WHERE concept_id = $1 AND metadata_object = $2 AND (metadata_field IS NOT DISTINCT FROM $3)`,
      [conceptId, metadataObject, metadataField]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE semantic_mappings SET confidence = 1, approved = TRUE, updated_at = NOW() WHERE id = $1`,
        [existing.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO semantic_mappings (concept_id, metadata_object, metadata_field, mapping_type, confidence, approved)
         VALUES ($1, $2, $3, $4, 1, TRUE)`,
        [conceptId, metadataObject, metadataField, mappingType || 'attribute']
      );
    }

    return { confirmed: true, conceptId, metadataObject, metadataField };
  }

  getLastTrace() {
    return this._lastTrace || null;
  }

  getLastResult() {
    return this._lastResult || null;
  }

  _emptyResult(input) {
    return {
      businessConcept: null,
      resolvedEntities: [],
      mappings: [],
      relations: [],
      confidence: 0,
      dimensions: { dimensions: [], resources: [] },
    };
  }
}

module.exports = OneCSemanticTranslator;