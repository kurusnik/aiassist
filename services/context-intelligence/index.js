const { applyQualityGate } = require('./qualityGate');
const { deduplicate } = require('./dedup');
const { coordinateSources } = require('./sourceCoordination');
const { applyTokenBudget } = require('./tokenBudgeting');
const { prioritizeSources } = require('./relevancePrioritization');
const { buildStructuredContext } = require('./structuredContext');
const { load: loadConfig } = require('./config');

const diagnosticsService = require('../diagnostics');

class ContextIntelligenceService {
  constructor() {
    this.cfg = loadConfig();
  }

  async process(hybridDocuments, knowledgeObjects = [], options = {}, trace = null) {
    const result = {
      contextText: '',
      structured: null,
      stats: {},
      stages: {},
      error: null,
      fallbackUsed: false
    };

    try {
      const qgResult = this._stepQualityGate(hybridDocuments, trace);
      const ddResult = this._stepDedup(qgResult.passed, trace);
      const scResult = this._stepCoordination(ddResult.documents, knowledgeObjects, trace);
      const rpResult = this._stepPrioritization(scResult.sources, trace);
      const tbResult = this._stepBudget(rpResult.prioritized, knowledgeObjects, trace);
      const scResultFinal = this._stepStructured(tbResult.included, tbResult.knowledgeIncluded, tbResult.excluded, trace);

      result.structured = scResultFinal;
      result.stages = {
        qualityGate: qgResult,
        dedup: ddResult,
        sourceCoordination: scResult,
        prioritization: rpResult,
        tokenBudget: tbResult
      };
    } catch (error) {
      console.error('[ContextIntelligence] Error:', error.message);
      result.error = error.message;
      result.fallbackUsed = true;
      result.fallbackRaw = {
        documents: hybridDocuments,
        knowledgeObjects
      };
    }

    return result;
  }

  _stepQualityGate(documents, trace) {
    const start = Date.now();
    const { passed, dropped, log } = applyQualityGate(documents);
    const duration = Date.now() - start;

    this._diagnosticsStep(trace, 'quality_gate', {
      inputCount: documents.length,
      outputCount: passed.length,
      droppedCount: dropped.length,
      threshold: this.cfg.qualityGate.minCombinedScore,
      duration,
      droppedDocs: dropped.map(d => ({ id: d.id, combinedScore: d.combinedScore }))
    });

    return { passed, dropped, log };
  }

  _stepDedup(documents, trace) {
    const start = Date.now();
    const { documents: deduped, removed, log } = deduplicate(documents);
    const duration = Date.now() - start;

    this._diagnosticsStep(trace, 'deduplication', {
      inputCount: documents.length,
      outputCount: deduped.length,
      removedCount: removed.length,
      duration,
      removals: log.map(l => ({ id: l.id, action: l.action, reason: l.action === 'dedup_by_id' ? 'duplicate id' : 'similar content' }))
    });

    return { documents: deduped, removed, log };
  }

  _stepCoordination(documents, knowledgeObjects, trace) {
    const start = Date.now();
    const { sources, log, conflicts } = coordinateSources(documents, knowledgeObjects);
    const duration = Date.now() - start;

    this._diagnosticsStep(trace, 'source_coordination', {
      ragCount: documents.length,
      knowledgeCount: knowledgeObjects.length,
      totalAfter: sources.length,
      conflictsFound: conflicts.length,
      duration,
      conflicts
    });

    return { sources, log, conflicts };
  }

  _stepPrioritization(sources, trace) {
    const start = Date.now();
    const { prioritized, log } = prioritizeSources(sources);
    const duration = Date.now() - start;

    this._diagnosticsStep(trace, 'relevance_prioritization', {
      inputCount: sources.length,
      outputCount: prioritized.length,
      duration,
      topScores: log.slice(0, 5).map(l => ({ id: l.id, score: l.priorityScore }))
    });

    return { prioritized, log };
  }

  _stepBudget(prioritized, knowledgeObjects, trace) {
    const start = Date.now();
    const budgetResult = applyTokenBudget(prioritized, knowledgeObjects);
    const duration = Date.now() - start;

    this._diagnosticsStep(trace, 'token_budgeting', {
      inputCount: prioritized.length,
      includedCount: budgetResult.included.length,
      excludedCount: budgetResult.excluded.length,
      maxChars: budgetResult.stats.maxChars,
      usedByDocs: budgetResult.stats.usedByDocs,
      duration,
      excludedDocs: budgetResult.excluded.map(d => ({ id: d.id, reason: 'budget_exceeded' }))
    });

    return budgetResult;
  }

  _stepStructured(included, knowledgeIncluded, excluded, trace) {
    const start = Date.now();
    const result = buildStructuredContext(included, knowledgeIncluded, excluded);
    const duration = Date.now() - start;

    this._diagnosticsStep(trace, 'structured_context', {
      primaryCount: result.stats.primaryCount,
      supportingCount: result.stats.supportingCount,
      knowledgeCount: result.stats.knowledgeCount,
      duration
    });

    return result;
  }

  _diagnosticsStep(trace, type, metadata) {
    if (!trace) return;
    diagnosticsService.startPipelineStep(trace, type);
    diagnosticsService.finishPipelineStep(trace, type, metadata);
  }
}

module.exports = new ContextIntelligenceService();