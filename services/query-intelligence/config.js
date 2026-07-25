const config = {
  enabled: false,
  interpreter: {
    timeout: 5000
  },
  normalizer: {
    enabled: true,
    removeStopWords: true
  },
  domain: {
    default: null,
    autoDetect: false
  },
  language: {
    default: 'ru'
  },
  tracing: {
    enabled: true,
    steps: {
      normalization: 'query_normalization',
      interpretation: 'query_interpretation',
      intent: 'query_intent',
      entities: 'query_entities',
      plan: 'query_plan'
    }
  }
};

function load() {
  if (process.env.QUERY_INTELLIGENCE_ENABLED === 'true') {
    config.enabled = true;
  }
  return config;
}

module.exports = { config, load };