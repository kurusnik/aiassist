const { config } = require('./config');

function rankResults(docs) {
  const sorted = docs.sort((a, b) => b.combinedScore - a.combinedScore);

  const rankLog = [];
  const ranked = sorted.map((doc, index) => {
    const rank = index + 1;
    const explanation = _explainScore(doc);
    rankLog.push({ id: doc.id, rank, combinedScore: doc.combinedScore, explanation });
    return {
      ...doc,
      rank,
      explanation
    };
  });

  const maxResults = config.merge.maxResults;
  const truncated = ranked.slice(0, maxResults);

  return { ranked: truncated, rankLog, totalBefore: ranked.length, totalAfter: truncated.length };
}

function _explainScore(doc) {
  const explanation = { vector: null, fts: null, combined: doc.combinedScore || 0 };

  if (doc.provenance && doc.provenance.includes('vector')) {
    explanation.vector = {
      raw: doc.vectorScore || 0,
      normalized: doc.vectorScoreNormalized || 0,
      weight: config.vector.weight
    };
  }

  if (doc.provenance && doc.provenance.includes('fts')) {
    explanation.fts = {
      raw: doc.ftsScore || 0,
      normalized: doc.ftsScoreNormalized || 0,
      weight: config.fts.weight
    };
  }

  return explanation;
}

module.exports = { rankResults };