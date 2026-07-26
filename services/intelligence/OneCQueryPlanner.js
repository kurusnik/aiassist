const OPERATION_MAP = {
  document_count:      { operation: 'count',    queryType: 'count' },
  document_list:       { operation: 'list',     queryType: 'list' },
  stock_balance:       { operation: 'balance',  queryType: 'balance' },
  batch_tracking:      { operation: 'balance',  queryType: 'balance' },
  register_sum:        { operation: 'aggregate', queryType: 'aggregate' },
  distribution_algorithm: { operation: 'code_search', queryType: 'code_search' },
  code_explanation:    { operation: 'code_search', queryType: 'code_search' },
};

const DEFAULT_RESOURCES = {
  balance:  ['Количество'],
  count:    [],
  list:     ['Номер', 'Дата'],
  aggregate: ['Сумма'],
};

class OneCQueryPlanner {
  plan(semanticPlan, knowledgeResult) {
    if (!semanticPlan || !semanticPlan.semanticOperation) {
      return this._emptyPlan('no_semantic_operation');
    }

    const { semanticOperation, hints } = semanticPlan;
    const translatorResult = semanticPlan.translatorResult || (knowledgeResult && knowledgeResult.translatorResult) || null;
    // P0-2: Propagate filters from semanticPlan to queryPlan
    const filters = semanticPlan.filters || null;

    const opConfig = OPERATION_MAP[semanticOperation] || {
      operation: 'query',
      queryType: 'metadata_search',
    };

    const selectedType = knowledgeResult && knowledgeResult.selected
      ? (knowledgeResult.selected.metadataObject || knowledgeResult.selected.name)
      : null;

    // P0-7: Also check translator resolvedEntities for full object name
    let resolvedObjectName = selectedType;
    if (translatorResult && translatorResult.resolvedEntities && translatorResult.resolvedEntities.length > 0) {
      const bestEntity = translatorResult.resolvedEntities.find(e => e.object && e.object.includes('.'));
      if (bestEntity && bestEntity.confidence >= 0.5) {
        resolvedObjectName = bestEntity.object;
      }
    }

    const queryStrategy = knowledgeResult && knowledgeResult.queryStrategy
      ? knowledgeResult.queryStrategy
      : { type: 'metadata_search', dimensions: [] };

    const dimensions = this._resolveDimensions(opConfig.queryType, queryStrategy, hints, translatorResult);
    const resources = this._resolveResources(opConfig.queryType, hints, translatorResult);
    const confidence = this._computeConfidence(knowledgeResult, translatorResult);

    const query = {
      type: opConfig.queryType,
      dimensions,
      resources,
    };

    const result = {
      operation: opConfig.operation,
      object: resolvedObjectName || selectedType,
      query,
      filters,
      confidence,
      translatorSources: translatorResult ? translatorResult.resolvedEntities : [],
    };

    console.log('[Query Planner]');
    console.log(`  semanticOperation: ${semanticOperation}`);
    console.log(`  selectedObject: ${resolvedObjectName || selectedType || 'none'}`);
    if (resolvedObjectName !== selectedType) {
      console.log(`  resolvedFrom: ${selectedType} → ${resolvedObjectName}`);
    }
    console.log(`  dimensions: ${JSON.stringify(dimensions)}`);
    console.log(`  resources: ${JSON.stringify(resources)}`);
    console.log(`  queryType: ${opConfig.queryType}`);
    console.log(`  confidence: ${confidence}`);
    if (translatorResult) {
      console.log(`  translator dimensions: ${JSON.stringify(translatorResult.dimensions)}`);
    }

    this._lastPlan = result;

    return result;
  }

  getLastPlan() {
    return this._lastPlan || null;
  }

  _resolveDimensions(queryType, queryStrategy, hints, translatorResult) {
    if (translatorResult && translatorResult.dimensions && translatorResult.dimensions.dimensions
        && translatorResult.dimensions.dimensions.length > 0) {
      return translatorResult.dimensions.dimensions;
    }

    const strategyDims = queryStrategy.dimensions || [];
    const hintDims = hints && hints.dimensions ? hints.dimensions : [];

    if (strategyDims.length > 0) {
      return strategyDims;
    }

    if (hintDims.length > 0) {
      return hintDims;
    }

    const defaults = {
      balance: ['Номенклатура'],
      count: [],
      list: ['Дата'],
      aggregate: ['Номенклатура'],
    };

    return defaults[queryType] || [];
  }

  _resolveResources(queryType, hints, translatorResult) {
    if (translatorResult && translatorResult.dimensions && translatorResult.dimensions.resources
        && translatorResult.dimensions.resources.length > 0) {
      return translatorResult.dimensions.resources;
    }

    const hintMetrics = hints && hints.metrics ? hints.metrics : [];

    if (hintMetrics.length > 0) {
      return hintMetrics;
    }

    return DEFAULT_RESOURCES[queryType] || [];
  }

  _computeConfidence(knowledgeResult, translatorResult) {
    let translatorBonus = 0;
    if (translatorResult && translatorResult.confidence > 0) {
      translatorBonus = translatorResult.confidence * 0.3;
    }

    if (!knowledgeResult || !knowledgeResult.objectCandidates || knowledgeResult.objectCandidates.length === 0) {
      return Math.round(translatorBonus * 100) / 100;
    }

    const candidates = knowledgeResult.objectCandidates;
    const maxScore = Math.max(...candidates.map(c => c.score));
    const avgScore = candidates.reduce((s, c) => s + c.score, 0) / candidates.length;

    const selectionConfidence = maxScore / 100;
    const typeConfidence = avgScore / 100;
    const gap = maxScore - (candidates.length > 1 ? candidates[1].score : 0);
    const gapConfidence = gap >= 30 ? 1 : gap >= 15 ? 0.85 : 0.7;

    const raw = selectionConfidence * 0.5 + typeConfidence * 0.1 + gapConfidence * 0.4 + translatorBonus;
    return Math.round(Math.min(raw, 1) * 100) / 100;
  }

  _emptyPlan(reason) {
    console.log(`[Query Planner] empty plan: ${reason}`);
    return {
      operation: 'unknown',
      object: null,
      query: { type: 'unknown', dimensions: [], resources: [] },
      confidence: 0,
      translatorSources: [],
    };
  }
}

module.exports = OneCQueryPlanner;