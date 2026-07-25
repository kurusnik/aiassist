const config = {
  vector: {
    weight: 0.6,
    limit: 10,
    threshold: 0.15
  },
  fts: {
    weight: 0.4,
    limit: 10,
    maxQueryLength: 500
  },
  merge: {
    maxResults: 10,
    dedupKeep: 'max_score'
  },
  normalize: {
    vectorScale: 1.0,
    ftsMaxRank: 1.0,
    smoothFactor: 0.01
  }
};

function load() {
  if (process.env.HYBRID_VECTOR_WEIGHT) config.vector.weight = parseFloat(process.env.HYBRID_VECTOR_WEIGHT);
  if (process.env.HYBRID_FTS_WEIGHT) config.fts.weight = parseFloat(process.env.HYBRID_FTS_WEIGHT);
  if (process.env.HYBRID_MAX_RESULTS) config.merge.maxResults = parseInt(process.env.HYBRID_MAX_RESULTS);
  if (process.env.HYBRID_VECTOR_THRESHOLD) config.vector.threshold = parseFloat(process.env.HYBRID_VECTOR_THRESHOLD);
  if (process.env.HYBRID_VECTOR_LIMIT) config.vector.limit = parseInt(process.env.HYBRID_VECTOR_LIMIT);
  if (process.env.HYBRID_FTS_LIMIT) config.fts.limit = parseInt(process.env.HYBRID_FTS_LIMIT);
  return config;
}

module.exports = { config, load };