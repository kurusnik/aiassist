const { config } = require('./config');

function prioritizeSources(sources) {
  const w = config.priority.weights;

  const scored = sources.map(source => {
    const scoreComponent = (source.combinedScore || 0) * w.combinedScore;
    const sourceTypeBoost = config.priority.sourceTypeBoost[source._sourceType] || 0.5;
    const sourceComponent = sourceTypeBoost * w.sourceType;
    const sizeComponent = _sizeScore(source) * w.docSize;
    const typeComponent = _docTypeScore(source) * w.docType;
    const freshnessComponent = _freshnessScore(source) * w.freshness;

    const priorityScore = scoreComponent + sourceComponent + sizeComponent + typeComponent + freshnessComponent;

    return {
      ...source,
      _priorityScore: priorityScore,
      _priorityBreakdown: {
        combinedScore: scoreComponent,
        sourceType: sourceComponent,
        docSize: sizeComponent,
        docType: typeComponent,
        freshness: freshnessComponent,
        total: priorityScore
      }
    };
  });

  scored.sort((a, b) => b._priorityScore - a._priorityScore);

  const log = scored.map(s => ({
    id: s.id,
    priorityScore: s._priorityScore,
    breakdown: s._priorityBreakdown
  }));

  return { prioritized: scored, log };
}

function _sizeScore(source) {
  const len = (source.content || '').length;
  if (len === 0) return 0;
  if (len < 200) return 1.0;
  if (len < 1000) return 0.8;
  if (len < 5000) return 0.5;
  return 0.2;
}

function _docTypeScore(source) {
  const meta = source.metadata || {};
  const category = meta.category || 'general';
  return config.priority.docTypeBoost[category] || config.priority.docTypeBoost.general;
}

function _freshnessScore(source) {
  if (!source.createdAt) return 0.5;
  const age = Date.now() - new Date(source.createdAt).getTime();
  const days = age / (1000 * 60 * 60 * 24);
  if (days < 7) return 1.0;
  if (days < 30) return 0.8;
  if (days < 90) return 0.6;
  if (days < 365) return 0.4;
  return 0.2;
}

module.exports = { prioritizeSources };