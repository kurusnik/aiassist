const BaseSearchProvider = require('./BaseSearchProvider');
const Candidate = require('../../context-intelligence/models/Candidate');

class HybridRetrievalProvider extends BaseSearchProvider {
  constructor() {
    super('hybrid_retrieval', 'hybrid');
  }

  async search(query, options = {}) {
    const hybridRetrieval = require('../../retrieval');
    const result = await hybridRetrieval.search(query, options);
    return result.documents.map(d => ({
      id: d.id,
      content: d.content,
      score: d.combinedScore || d.similarity || 0,
      meta: {
        source: 'retrieval',
        type: 'document',
        methods: d.provenance || ['vector'],
        metadata: {
          projectId: options.projectId,
          explanation: d.explanation,
          rank: d.rank
        }
      }
    }));
  }

  async getCandidates(queryContext, options = {}) {
    const results = await this.search(queryContext.rawQuery, options);
    return results.map(r => new Candidate(
      r.id,
      r.content,
      r.score,
      {
        source: r.meta.source,
        type: r.meta.type,
        methods: r.meta.methods,
        createdAt: null,
        metadata: r.meta.metadata
      }
    ));
  }

  async health() {
    return { name: this.name, available: true };
  }
}

module.exports = HybridRetrievalProvider;