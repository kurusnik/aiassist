const { vectorSearch } = require('../rag/search');
const { ftsSearch } = require('./ftsSearch');
const { mergeResults } = require('./merge');
const { normalizeResults } = require('./normalize');
const { rankResults } = require('./rank');
const { config, load: loadConfig } = require('./config');

const diagnosticsService = require('../diagnostics');

class HybridRetrievalService {
  constructor() {
    this.cfg = loadConfig();
  }

  async search(query, options = {}, trace = null) {
    const {
      projectId,
      userId,
      fallbackOnError = true
    } = options;

    const result = {
      documents: [],
      stages: {},
      error: null,
      fallbackUsed: false
    };

    try {
      result.stages.vector = await this._execVectorSearch(query, options, trace);
      result.stages.fts = await this._execFtsSearch(query, options, trace);
      result.stages.merge = await this._execMerge(result.stages.vector, result.stages.fts, trace);
      result.stages.normalize = this._execNormalize(result.stages.merge, trace);
      result.stages.rank = this._execRank(result.stages.normalize, trace);

      result.documents = result.stages.rank.ranked;
    } catch (error) {
      console.error('[HybridRetrieval] Pipeline error:', error.message);
      result.error = error.message;

      if (fallbackOnError) {
        await this._diagnosticsStep(trace, 'hybrid_retrieval_fallback', {
          reason: error.message
        });

        try {
          const vectorDocs = await vectorSearch(query, { projectId, userId, limit: 5, threshold: 0.1 });
          result.documents = vectorDocs.map(d => ({
            ...d,
            rank: 0,
            provenance: ['vector'],
            combinedScore: d.similarity || 0,
            explanation: 'fallback: vector only'
          }));
          result.fallbackUsed = true;
        } catch (fallbackErr) {
          console.error('[HybridRetrieval] Fallback also failed:', fallbackErr.message);
          result.error = fallbackErr.message;
        }
      }
    }

    return result;
  }

  async _execVectorSearch(query, options, trace) {
    const { projectId, userId } = options;
    const limit = this.cfg.vector.limit;
    const threshold = this.cfg.vector.threshold;

    const start = Date.now();
    const docs = await vectorSearch(query, { projectId, userId, limit, threshold });
    const duration = Date.now() - start;

    await this._diagnosticsStep(trace, 'vector_search', {
      documentsFound: docs.length,
      duration,
      threshold
    });

    return {
      documents: docs,
      duration,
      count: docs.length
    };
  }

  async _execFtsSearch(query, options, trace) {
    const { projectId, userId } = options;
    const limit = this.cfg.fts.limit;

    const start = Date.now();
    const ftsResult = await ftsSearch(query, { projectId, userId, limit });
    const duration = Date.now() - start;

    await this._diagnosticsStep(trace, 'full_text_search', {
      documentsFound: ftsResult.results.length,
      duration,
      ftsQuery: ftsResult.query,
      error: ftsResult.error || null
    });

    return {
      documents: ftsResult.results,
      duration,
      count: ftsResult.results.length,
      query: ftsResult.query
    };
  }

  async _execMerge(vectorStage, ftsStage, trace) {
    const start = Date.now();
    const { results, mergeLog } = mergeResults(vectorStage.documents, ftsStage.documents);
    const duration = Date.now() - start;

    await this._diagnosticsStep(trace, 'merge', {
      vectorCount: vectorStage.count,
      ftsCount: ftsStage.count,
      mergedCount: results.length,
      duration,
      mergeLog
    });

    return { documents: results, mergeLog };
  }

  _execNormalize(mergeStage, trace) {
    const start = Date.now();
    const { normLog } = normalizeResults(mergeStage.documents);
    const duration = Date.now() - start;

    diagnosticsService.finishPipelineStep(trace, 'normalize', {
      documentsCount: mergeStage.documents.length,
      duration,
      normLog
    });

    return { documents: mergeStage.documents, normLog };
  }

  _execRank(normalizeStage, trace) {
    const start = Date.now();
    const { ranked, rankLog, totalBefore, totalAfter } = rankResults(normalizeStage.documents);
    const duration = Date.now() - start;

    diagnosticsService.finishPipelineStep(trace, 'rank', {
      documentsBefore: totalBefore,
      documentsAfter: totalAfter,
      duration,
      rankLog
    });

    return { ranked, rankLog, totalBefore, totalAfter };
  }

  async _diagnosticsStep(trace, type, metadata) {
    if (!trace) return;
    diagnosticsService.startPipelineStep(trace, type);
    diagnosticsService.finishPipelineStep(trace, type, metadata);
  }

  getConfig() {
    return this.cfg;
  }
}

module.exports = new HybridRetrievalService();