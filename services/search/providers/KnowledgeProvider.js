const BaseSearchProvider = require('./BaseSearchProvider');
const Candidate = require('../../context-intelligence/models/Candidate');

class KnowledgeProvider extends BaseSearchProvider {
  constructor() {
    super('knowledge_1c', 'structured');
  }

  async search(query, options = {}) {
    const { build: buildKnowledgeContext } = require('../../knowledge/contextBuilder');
    const ctx = await buildKnowledgeContext(query);
    if (!ctx.found) return [];
    return (ctx.objects || []).map(obj => ({
      id: obj.full_name || obj.name || `knowledge_${Date.now()}`,
      content: obj.full_name || obj.name || '',
      score: 0.9,
      meta: {
        source: 'knowledge',
        type: 'object',
        methods: ['mcp'],
        metadata: { ...obj }
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