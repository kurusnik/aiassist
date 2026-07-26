const patterns = require('./onecSemanticPatterns');
const OneCSemanticTranslator = require('./OneCSemanticTranslator');

const OBJECT_TYPE_MAP = {
  'Документ': 'document',
  'Справочник': 'catalog',
  'РегистрНакопления': 'register',
  'РегистрСведений': 'info_register',
  'РегистрБухгалтерии': 'accounting_register',
  'ОбщийМодуль': 'common_module',
};

const QUERY_STRATEGIES = {
  document_count: {
    type: 'count_query',
    dimensions: ['Дата'],
  },
  document_list: {
    type: 'list_query',
    dimensions: ['Дата'],
  },
  stock_balance: {
    type: 'balance_query',
    dimensions: ['Номенклатура', 'Склад', 'Партия'],
  },
  batch_tracking: {
    type: 'dimension_query',
    dimensions: ['Номенклатура', 'Партия', 'Серия', 'СрокГодности'],
  },
  distribution_algorithm: {
    type: 'code_search',
  },
  register_sum: {
    type: 'aggregate_query',
    dimensions: ['Номенклатура', 'Сумма'],
  },
};

class OneCKnowledgeResolver {
  constructor() {
    this._semanticTranslator = new OneCSemanticTranslator();
  }

  resolve(semanticPlan) {
    if (!semanticPlan || !semanticPlan.semanticOperation) {
      return this._emptyResult('no_semantic_operation');
    }

    const { semanticOperation, hints, entity } = semanticPlan;
    const pattern = patterns.findByOperation(semanticOperation);
    const trace = { operation: semanticOperation, patternsMatched: [], candidates: [] };

    if (!pattern) {
      return this._resolveFromHints(semanticPlan, trace);
    }

    trace.patternsMatched.push(...(pattern.patterns || [semanticOperation + '_pattern']));

    const preferredTypes = hints && hints.preferredTypes && hints.preferredTypes.length > 0
      ? hints.preferredTypes
      : pattern.objectTypes;

    const candidates = preferredTypes.map((type, idx) => {
      const objectType = OBJECT_TYPE_MAP[type] || type;
      const baseScore = pattern.score || 35;
      const typePriority = this._getTypePriority(type, semanticOperation);
      const entityScore = entity && pattern.keywords
        ? this._matchEntityToKeywords(entity, pattern.keywords)
        : 0;
      const totalScore = baseScore + typePriority + entityScore;
      return {
        name: type,
        objectType,
        score: Math.min(totalScore, 100),
        reason: [
          semanticOperation,
          this._getPatternLabel(pattern),
          entity ? entity : null,
        ].filter(Boolean),
      };
    });

    candidates.sort((a, b) => b.score - a.score);
    trace.candidates = candidates;

    const selected = candidates[0] || null;

    const queryStrategy = QUERY_STRATEGIES[semanticOperation] || {
      type: 'metadata_search',
      dimensions: (hints && hints.dimensions) || [],
    };

    const executorHint = pattern.executorHint || (semanticPlan.executor || 'onec_query');

    const result = {
      objectTypes: preferredTypes,
      objectCandidates: candidates,
      selected,
      queryStrategy,
      trace,
      executorHint,
      translatorResult: null,
    };

    console.log('[Semantic Knowledge]');
    console.log(`  operation: ${semanticOperation}`);
    console.log(`  patterns matched: ${JSON.stringify(trace.patternsMatched)}`);
    console.log(`  candidates: ${JSON.stringify(candidates.map(c => ({ name: c.name, score: c.score })))}`);
    console.log(`  selected: ${selected ? selected.name : 'none'}`);

    this._lastTrace = trace;

    return result;
  }

  async resolveWithMemory(semanticPlan) {
    const baseResult = this.resolve(semanticPlan);

    if (!semanticPlan || !semanticPlan.entity) {
      return baseResult;
    }

    const translatorInput = {
      semanticOperation: semanticPlan.semanticOperation,
      entity: semanticPlan.entity,
      filters: semanticPlan.filters || {},
      intent: semanticPlan.taskType || 'data_query',
      knowledgeContext: baseResult,
    };

    let translatorResult;
    try {
      translatorResult = await this._semanticTranslator.translate(translatorInput);
    } catch (err) {
      console.log(`[Semantic Knowledge] translator error: ${err.message}`);
      return baseResult;
    }

    baseResult.translatorResult = translatorResult;

    if (translatorResult.confidence >= 0.8 && translatorResult.resolvedEntities.length > 0) {
      const memoryCandidates = translatorResult.resolvedEntities.map((e, idx) => {
        const parts = (e.object || '').split('.');
        const typeName = parts.length > 1 ? parts[0] : e.object;
        const objectType = OBJECT_TYPE_MAP[typeName] || typeName;
        return {
          name: typeName,
          objectType,
          score: Math.round(e.confidence * 100),
          reason: ['semantic_memory', e.concept, e.object].filter(Boolean),
          metadataObject: e.object,
          metadataField: e.field,
        };
      });

      const merged = [...memoryCandidates, ...baseResult.objectCandidates];
      const seen = new Set();
      const deduped = [];
      for (const c of merged) {
        const key = c.name;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(c);
        }
      }

      deduped.sort((a, b) => b.score - a.score);
      baseResult.objectCandidates = deduped;
      baseResult.selected = deduped[0] || baseResult.selected;
      baseResult.trace.patternsMatched.push('semantic_memory_lookup');

      if (translatorResult.dimensions) {
        baseResult.queryStrategy.dimensions = translatorResult.dimensions.dimensions || baseResult.queryStrategy.dimensions;
      }

      console.log(`[Semantic Knowledge] memory-enhanced: ${translatorResult.confidence} confidence`);
      console.log(`  entities: ${JSON.stringify(translatorResult.resolvedEntities.map(e => ({ concept: e.concept, object: e.object })))}`);
    }

    return baseResult;
  }

  getSemanticTranslator() {
    return this._semanticTranslator;
  }

  getLastTrace() {
    return this._lastTrace || null;
  }

  _resolveFromHints(semanticPlan, trace) {
    const hints = semanticPlan.hints || {};
    const preferredTypes = hints.preferredTypes || [];

    if (preferredTypes.length === 0) {
      return this._emptyResult('no_pattern_no_hints', trace);
    }

    const candidates = preferredTypes.map((type, idx) => {
      const baseScore = 25;
      const typePriority = this._getTypePriority(type, 'unknown');
      return {
        name: type,
        objectType: OBJECT_TYPE_MAP[type] || type,
        score: baseScore + typePriority,
        reason: ['hint_fallback', type],
      };
    });

    candidates.sort((a, b) => b.score - a.score);
    trace.candidates = candidates;
    trace.patternsMatched.push('hint_fallback');

    const selected = candidates[0] || null;

    return {
      objectTypes: preferredTypes,
      objectCandidates: candidates,
      selected,
      queryStrategy: { type: 'metadata_search', dimensions: hints.dimensions || [] },
      trace,
      executorHint: semanticPlan.executor || 'onec_query',
      translatorResult: null,
    };
  }

  _emptyResult(reason, trace) {
    const t = trace || { operation: 'none', patternsMatched: [], candidates: [] };
    t.patternsMatched.push(reason);
    console.log(`[Semantic Knowledge] empty result: ${reason}`);
    return {
      objectTypes: [],
      objectCandidates: [],
      selected: null,
      queryStrategy: { type: 'unknown' },
      trace: t,
      executorHint: 'onec_query',
      translatorResult: null,
    };
  }

  _getTypePriority(type, operation) {
    const priorities = {
      data_query: { 'Документ': 50, 'Справочник': 40, 'РегистрНакопления': 30, 'РегистрСведений': 20 },
      explain: { 'Документ': 30, 'Справочник': 30, 'РегистрНакопления': 30, 'РегистрСведений': 30 },
    };
    const map = priorities[operation] || priorities.data_query;
    return map[type] || 0;
  }

  _getPatternLabel(pattern) {
    if (pattern.patterns && pattern.patterns.length > 0) {
      return pattern.patterns[0];
    }
    return 'pattern_match';
  }

  _matchEntityToKeywords(entity, keywords) {
    if (!entity || !keywords) return 0;
    const lower = entity.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw) || kw.includes(lower)) {
        return 10;
      }
    }
    return 0;
  }
}

module.exports = OneCKnowledgeResolver;