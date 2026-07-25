const { applyQualityGate } = require('./qualityGate');
const { deduplicate } = require('./dedup');
const { coordinateSources } = require('./sourceCoordination');
const { applyTokenBudget } = require('./tokenBudgeting');
const { prioritizeSources } = require('./relevancePrioritization');
const { buildStructuredContext } = require('./structuredContext');
const CandidateValidator = require('./validators/CandidateValidator');
const { load: loadConfig } = require('./config');
const diagnosticsService = require('../diagnostics');

class ContextIntelligenceService {
  constructor() {
    this.cfg = loadConfig();
    this.validator = new CandidateValidator();
  }

  async process(candidates, options = {}, trace = null) {
    const result = {
      contextText: '',
      structured: null,
      stats: {},
      stages: {},
      error: null,
      fallbackUsed: false
    };

    try {
      const vlResult = this._stepValidation(candidates, trace);

      const qgResult = this._stepQualityGate(vlResult.valid, trace);
      const ddResult = this._stepDedup(qgResult.passed, trace);
      const scResult = this._stepCoordination(ddResult.documents, trace);
      const rpResult = this._stepPrioritization(scResult.sources, trace);
      const tbResult = this._stepBudget(rpResult.prioritized, trace);
      const scResultFinal = this._stepStructured(tbResult.included, tbResult.excluded, trace);

      result.structured = scResultFinal;
      result.stages = {
        validation: vlResult,
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
    }

    return result;
  }

  _stepValidation(candidates, trace) {
    if (trace) {
      diagnosticsService.startPipelineStep(trace, 'candidate_validation');
    }

    const start = Date.now();
    const { valid, rejected } = this.validator.validate(candidates);
    const duration = Date.now() - start;

    if (trace) {
      diagnosticsService.finishPipelineStep(trace, 'candidate_validation', {
        duration,
        inputCount: candidates.length,
        validCount: valid.length,
        rejectedCount: rejected.length,
        rejected: rejected.length > 0 ? rejected : undefined
      });
    }

    return { valid, rejected, total: candidates.length };
  }

  _stepQualityGate(candidates, trace) {
    const start = Date.now();
    const { passed, dropped, log } = applyQualityGate(candidates);
    const duration = Date.now() - start;

    this._diagnosticsStep(trace, 'quality_gate', {
      inputCount: candidates.length,
      outputCount: passed.length,
      droppedCount: dropped.length,
      threshold: this.cfg.qualityGate.minCombinedScore,
      duration,
      droppedCandidates: dropped.map(c => ({ id: c.id, score: c.score }))
    });

    return { passed, dropped, log };
  }

  _stepDedup(candidates, trace) {
    const start = Date.now();
    const { documents: deduped, removed, log } = deduplicate(candidates);
    const duration = Date.now() - start;

    this._diagnosticsStep(trace, 'deduplication', {
      inputCount: candidates.length,
      outputCount: deduped.length,
      removedCount: removed.length,
      duration,
      removals: log.map(l => ({ id: l.id, action: l.action }))
    });

    return { documents: deduped, removed, log };
  }

  _stepCoordination(candidates, trace) {
    const start = Date.now();
    const { sources, log, conflicts } = coordinateSources(candidates);
    const duration = Date.now() - start;

    const sourcesByType = {};
    for (const s of sources) {
      const src = s.meta.source || 'unknown';
      sourcesByType[src] = (sourcesByType[src] || 0) + 1;
    }

    this._diagnosticsStep(trace, 'source_coordination', {
      inputCount: candidates.length,
      totalAfter: sources.length,
      conflictsFound: conflicts.length,
      sourcesByType,
      duration,
      conflicts
    });

    return { sources, log, conflicts };
  }

  _stepPrioritization(candidates, trace) {
    const start = Date.now();
    const { prioritized, log } = prioritizeSources(candidates);
    const duration = Date.now() - start;

    this._diagnosticsStep(trace, 'relevance_prioritization', {
      inputCount: candidates.length,
      outputCount: prioritized.length,
      duration,
      topScores: log.slice(0, 5).map(l => ({ id: l.id, score: l.priorityScore }))
    });

    return { prioritized, log };
  }

  _stepBudget(candidates, trace) {
    const start = Date.now();
    const budgetResult = applyTokenBudget(candidates);
    const duration = Date.now() - start;

    this._diagnosticsStep(trace, 'token_budgeting', {
      inputCount: candidates.length,
      includedCount: budgetResult.included.length,
      excludedCount: budgetResult.excluded.length,
      maxChars: budgetResult.stats.maxChars,
      usedByCandidates: budgetResult.stats.usedByCandidates,
      duration,
      excludedCandidates: budgetResult.excluded.map(c => ({ id: c.id, reason: 'budget_exceeded' }))
    });

    return budgetResult;
  }

  _stepStructured(included, excluded, trace) {
    const start = Date.now();
    const result = buildStructuredContext(included, excluded);
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