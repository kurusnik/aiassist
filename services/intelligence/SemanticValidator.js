const pool = require('../../db');
const SemanticConfidenceCalculator = require('./SemanticConfidenceCalculator');

class SemanticValidator {
  constructor() {
    this._confidenceCalculator = new SemanticConfidenceCalculator();
  }

  async validate({ fusionResult, translatorResult, knowledgeResult, projectId, term }) {
    const trace = {
      stage: 'Semantic Validation',
      term,
      projectId,
      checks: [],
      result: null,
    };

    const warnings = [];
    const corrections = [];
    const sourceSummary = {};

    if (fusionResult && fusionResult.sources) {
      for (const s of fusionResult.sources) {
        sourceSummary[s.type] = { confidence: s.confidence, count: s.mappings.length };
      }
    }

    const confidence = this._resolveConfidence(fusionResult, translatorResult, knowledgeResult);
    trace.checks.push({ check: 'confidence_threshold', confidence });

    const sources = this._resolveSources(fusionResult);
    const suggestedMappings = this._resolveSuggestedMappings(fusionResult);

    let decision;
    if (confidence < 0.5) {
      decision = 'blocked';
      // P0-4/Cold start: Provide specific correction based on context
      const isColdStart = sources.length === 0 && !fusionResult?.found;
      if (isColdStart) {
        corrections.push(`Термин "${term}" не имеет маппинга в базе знаний. Система попытается найти объект через MCP. Если объект будет найден — подтвердите его для сохранения.`);
      } else {
        corrections.push('Недостаточно данных для построения запроса. Уточните бизнес-термин.');
      }
    } else {
      decision = 'execute';
    }

    // Check: Missing 1C object
    if (suggestedMappings && suggestedMappings.length > 0) {
      const hasObject = suggestedMappings.some(m => m.metadata_object);
      if (!hasObject) {
        warnings.push('Бизнес-термин найден, но нет объекта 1С');
      }
    }

    // Check: Missing dimension
    const translatorEntities = translatorResult && translatorResult.resolvedEntities ? translatorResult.resolvedEntities : [];
    const businessConcept = translatorResult && translatorResult.businessConcept ? translatorResult.businessConcept : null;
    const expectedDims = {
      sales_analysis: ['Номенклатура', 'Бренд'],
      stock_balance: ['Номенклатура', 'Склад', 'Партия'],
      sales_by_customer: ['Контрагент'],
      batch_tracking: ['Номенклатура', 'Партия', 'Серия', 'СрокГодности'],
      cost_analysis: ['Номенклатура', 'Партия'],
    };
    const expected = expectedDims[businessConcept];
    if (expected && translatorEntities.length > 0) {
      for (const dim of expected) {
        const found = translatorEntities.some(e => {
          const objPart = e.object ? e.object.split('.').pop() : '';
          const fieldPart = e.field ? e.field.split('.').pop() : '';
          return objPart.toLowerCase() === dim.toLowerCase() || fieldPart.toLowerCase() === dim.toLowerCase();
        });
        if (!found) {
          warnings.push(`Не найдено измерение ${dim}`);
        }
      }
    }

    // Check: Knowledge conflict between project and RAG — checked BEFORE multi-variant
    const projectMappings = sources.filter(s => s.type === 'project_mapping').flatMap(s => s.mappings || []);
    const ragMappings = sources.filter(s => s.type === 'project_rag' || s.type === 'global_rag').flatMap(s => s.mappings || []);

    if (projectMappings.length > 0 && ragMappings.length > 0) {
      const projectObj = projectMappings[0].metadata_object;
      const projectField = projectMappings[0].metadata_field || '';
      const ragObj = ragMappings[0].metadata_object;
      const ragField = ragMappings[0].metadata_field || '';
      if (projectObj !== ragObj || projectField !== ragField) {
        decision = 'conflict';
        warnings.push(`Конфликт знаний: проект указывает ${projectObj}.${projectField}, RAG указывает ${ragObj}.${ragField}`);
      }
    }

    // Check: Multiple mapping variants (only if no conflict)
    if (decision !== 'conflict') {
      const allMappings = sources.flatMap(s => s.mappings || []);
      const uniqueObjects = new Set(allMappings.map(m => m.metadata_object).filter(Boolean));
      if (uniqueObjects.size > 1) {
        if (decision === 'execute') {
          decision = 'confirmation_required';
        }
        if (!warnings.some(w => w.includes('вариант'))) {
          warnings.push(`Найдено несколько вариантов: ${[...uniqueObjects].join(', ')}`);
        }
      }
    }

    // Check: Medium confidence override
    if (decision === 'execute' && confidence >= 0.5 && confidence < 0.8) {
      decision = 'confirmation_required';
    }

    // Build suggestion for confirmation_required
    let suggestion = null;
    if (decision === 'confirmation_required' || decision === 'conflict') {
      suggestion = this._buildSuggestion(term, sources, suggestedMappings, warnings);
    }

    const result = {
      valid: decision === 'execute',
      confidence,
      decision,
      warnings,
      corrections,
      suggestion,
      sourceSummary,
    };

    trace.checks.push({ check: 'decision', decision, warnings: warnings.length, corrections: corrections.length });
    trace.result = result;

    // Log to DB
    await this._logValidation(projectId, term, confidence, decision, fusionResult, warnings, corrections, sourceSummary).catch(() => {});

    console.log('[Semantic Validation]');
    console.log(`  term: ${term}`);
    console.log(`  confidence: ${confidence}`);
    console.log(`  decision: ${decision}`);
    console.log(`  warnings: ${warnings.length > 0 ? warnings.join('; ') : 'none'}`);
    console.log(`  valid: ${result.valid}`);

    this._lastTrace = trace;
    this._lastResult = result;

    return result;
  }

  _resolveConfidence(fusionResult, translatorResult, knowledgeResult) {
    // Delegate to SemanticConfidenceCalculator for consistent, traceable computation
    const { confidence } = this._confidenceCalculator.calculate({
      fusionResult,
      translatorResult,
      knowledgeResult,
    });
    return confidence;
  }

  _resolveSources(fusionResult) {
    if (fusionResult && fusionResult.sources) return fusionResult.sources;
    if (fusionResult && fusionResult.mappings && fusionResult.mappings.length > 0) {
      return [{ type: fusionResult.source || 'unknown', confidence: fusionResult.confidence || 0, mappings: fusionResult.mappings }];
    }
    return [];
  }

  _resolveSuggestedMappings(fusionResult) {
    if (fusionResult && fusionResult.suggestedMappings) return fusionResult.suggestedMappings;
    if (fusionResult && fusionResult.mappings) return fusionResult.mappings;
    return [];
  }

  _buildSuggestion(term, sources, suggestedMappings, warnings) {
    const allMappings = sources.flatMap(s => s.mappings || []).length > 0
      ? sources.flatMap(s => s.mappings || [])
      : suggestedMappings;

    if (allMappings.length === 0) {
      // Cold start: no mappings at all — offer onboarding
      return {
        question: `Термин "${term}" пока не связан с объектом 1С.\n\nВы можете:\n1. Указать объект вручную (например: Документ.РеализацияТоваровУслуг)\n2. Или подождать — система попробует найти через MCP`,
        options: [],
        isColdStart: true,
      };
    }

    const uniqueMappings = new Map();
    for (const m of allMappings) {
      const key = `${m.metadata_object}${m.metadata_field ? '.' + m.metadata_field : ''}`;
      if (!uniqueMappings.has(key)) {
        uniqueMappings.set(key, {
          mapping: key,
          source: m.source || 'unknown',
          confidence: m.confidence,
        });
      }
    }

    const options = [...uniqueMappings.values()];
    const question = options.length > 1
      ? `Нашёл варианты:\n${options.map((o, i) => `${i + 1}. ${o.mapping}`).join('\n')}\n\nКакой использовать?`
      : `Я предполагаю, что "${term}" хранится в ${options[0].mapping}. Подтвердить?`;

    return { question, options };
  }

  async _logValidation(projectId, term, confidence, decision, fusionResult, warnings, corrections, sourceSummary) {
    const suggested = this._resolveSuggestedMappings(fusionResult);
    const selectedMapping = suggested && suggested.length > 0
      ? `${suggested[0].metadata_object}${suggested[0].metadata_field ? '.' + suggested[0].metadata_field : ''}`
      : null;

    await pool.query(
      `INSERT INTO semantic_validation_logs (project_id, term, confidence, decision, selected_mapping, warnings, corrections, source_summary)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)`,
      [projectId || null, term, confidence, decision, selectedMapping, JSON.stringify(warnings), JSON.stringify(corrections), JSON.stringify(sourceSummary)]
    );
  }

  async handleUserFeedback({ projectId, term, confirmed, metadataObject, metadataField, mappingType, correction }) {
    if (confirmed) {
      let concept = await pool.query('SELECT id FROM semantic_concepts WHERE name = $1', [term]);
      if (concept.rows.length === 0) {
        concept = await pool.query('INSERT INTO semantic_concepts (name) VALUES ($1) RETURNING id', [term]);
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
           source = 'user_confirmation', updated_at = NOW() WHERE id = $1`,
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

      console.log(`[SemanticValidator] User confirmed: ${term} → ${metadataObject}.${metadataField || ''}`);

      await pool.query(
        `INSERT INTO semantic_validation_logs (project_id, term, confidence, decision, selected_mapping, warnings, corrections, source_summary)
         VALUES ($1, $2, 1, 'execute', $3, '[]'::jsonb, '["user_confirmed"]'::jsonb, '{}'::jsonb)`,
        [projectId || null, term, `${metadataObject}${metadataField ? '.' + metadataField : ''}`]
      );

      return { confirmed: true, conceptId, metadataObject, metadataField, projectId, term };
    }

    if (correction) {
      await pool.query(
        `INSERT INTO semantic_validation_logs (project_id, term, confidence, decision, selected_mapping, warnings, corrections, source_summary)
         VALUES ($1, $2, 0, 'blocked', NULL, '[]'::jsonb, $3::jsonb, '{}'::jsonb)`,
        [projectId || null, term, JSON.stringify([correction])]
      );
      console.log(`[SemanticValidator] User correction: ${term} — ${correction}`);
    }

    return { confirmed: false, recorded: true };
  }

  getLastTrace() {
    return this._lastTrace || null;
  }

  getLastResult() {
    return this._lastResult || null;
  }
}

module.exports = SemanticValidator;