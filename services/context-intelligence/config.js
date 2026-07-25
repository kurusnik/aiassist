const config = {
  qualityGate: {
    minCombinedScore: 0.15,
    enabled: true
  },
  dedup: {
    enabled: true,
    contentSimilarityThreshold: 0.85
  },
  tokenBudget: {
    maxContextChars: 8000,
    reserveForKnowledge: 2000,
    docOverhead: 100
  },
  priority: {
    weights: {
      combinedScore: 0.5,
      sourceType: 0.2,
      freshness: 0.1,
      docType: 0.1,
      docSize: 0.1
    },
    sourceTypeBoost: {
      retrieval: 1.0,
      knowledge: 0.5,
      mcp: 0.5,
      academy: 0.4,
      memory: 0.3
    },
    docTypeBoost: {
      documentation: 1.0,
      code: 0.8,
      faq: 0.9,
      guide: 0.9,
      object: 0.7,
      general: 0.6
    }
  }
};

function load() {
  if (process.env.CI_QUALITY_THRESHOLD) config.qualityGate.minCombinedScore = parseFloat(process.env.CI_QUALITY_THRESHOLD);
  if (process.env.CI_MAX_CONTEXT_CHARS) config.tokenBudget.maxContextChars = parseInt(process.env.CI_MAX_CONTEXT_CHARS);
  if (process.env.CI_KNOWLEDGE_RESERVE) config.tokenBudget.reserveForKnowledge = parseInt(process.env.CI_KNOWLEDGE_RESERVE);
  if (process.env.CI_SCORE_WEIGHT) config.priority.weights.combinedScore = parseFloat(process.env.CI_SCORE_WEIGHT);
  if (process.env.CI_SOURCE_WEIGHT) config.priority.weights.sourceType = parseFloat(process.env.CI_SOURCE_WEIGHT);
  return config;
}

module.exports = { config, load };