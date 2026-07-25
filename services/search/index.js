const HybridRetrievalProvider = require('./providers/HybridRetrievalProvider');
const KnowledgeProvider = require('./providers/KnowledgeProvider');

class SearchOrchestrator {
  constructor() {
    this.providers = [
      new HybridRetrievalProvider(),
      new KnowledgeProvider()
    ];
  }

  async getCandidates(queryContext, options = {}, trace = null) {
    const diagnosticsService = require('../diagnostics');
    if (trace) {
      diagnosticsService.startPipelineStep(trace, 'search_providers');
    }

    const start = Date.now();
    const results = await Promise.allSettled(
      this.providers.map(p => p.getCandidates(queryContext, options))
    );

    const allCandidates = [];
    const providerErrors = [];

    for (let i = 0; i < this.providers.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled') {
        allCandidates.push(...r.value);
      } else {
        providerErrors.push({
          provider: this.providers[i].name,
          error: r.reason.message
        });
      }
    }

    const duration = Date.now() - start;

    if (trace) {
      const countsBySource = {};
      for (const c of allCandidates) {
        const src = c.meta.source || 'unknown';
        countsBySource[src] = (countsBySource[src] || 0) + 1;
      }

      diagnosticsService.finishPipelineStep(trace, 'search_providers', {
        duration,
        totalCandidates: allCandidates.length,
        providersUsed: this.providers.length,
        providersFailed: providerErrors.length,
        countsBySource,
        errors: providerErrors.length > 0 ? providerErrors : undefined
      });
    }

    return { candidates: allCandidates, errors: providerErrors };
  }

  getProviders() {
    return this.providers.map(p => ({ name: p.name, method: p.method }));
  }
}

module.exports = new SearchOrchestrator();