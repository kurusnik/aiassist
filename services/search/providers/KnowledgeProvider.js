const BaseSearchProvider = require('./BaseSearchProvider');
const Candidate = require('../../context-intelligence/models/Candidate');
const KnowledgeScorer = require('../../knowledge/scoring/KnowledgeScorer');

const scorer = new KnowledgeScorer();

class KnowledgeProvider extends BaseSearchProvider {
  constructor() {
    super('knowledge_1c', 'structured');
  }

  async search(query, options = {}) {
    const { build: buildKnowledgeContext } = require('../../knowledge/contextBuilder');
    const queryContext = options.queryContext || { rawQuery: query, normalizedQuery: null, intent: null, entities: [] };
    const ctx = await buildKnowledgeContext(query, queryContext);
    if (!ctx.found) return [];
    return (ctx.objects || []).map(obj => ({
      id: obj.full_name || obj.name || `knowledge_${Date.now()}`,
      content: obj.structuredText || obj.full_name || obj.name || '',
      score: obj.score,
      meta: {
        source: 'knowledge',
        type: '1c',
        methods: ['mcp'],
        metadata: obj.meta || {
          objectType: null,
          fields: [],
          relations: [],
          synonym: null,
          comment: null
        }
      }
    }));
  }

  async getCandidates(queryContext, options = {}) {
    const rawQuery = queryContext.rawQuery || '';
    const searchOptions = { ...options, queryContext };
    const results = await this.search(rawQuery, searchOptions);
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
    try {
      const knowledgeService = require('../../knowledge/service');
      const h = await knowledgeService.health();
      return { name: this.name, available: h.objects > 0, objects: h.objects };
    } catch {
      return { name: this.name, available: false };
    }
  }
}

module.exports = KnowledgeProvider;