const { config } = require('./config');

function prioritizeSources(candidates) {
  const w = config.priority.weights;

  const scores = new Map();
  const breakdowns = new Map();

  for (const c of candidates) {
    const scoreComponent = (c.score || 0) * w.combinedScore;
    const sourceTypeBoost = config.priority.sourceTypeBoost[c.meta.source] || 0.5;
    const sourceComponent = sourceTypeBoost * w.sourceType;
    const sizeComponent = _sizeScore(c) * w.docSize;
    const typeComponent = _docTypeScore(c) * w.docType;
    const freshnessComponent = _freshnessScore(c) * w.freshness;

    const priorityScore = scoreComponent + sourceComponent + sizeComponent + typeComponent + freshnessComponent;

    scores.set(c.id, priorityScore);
    breakdowns.set(c.id, {
      combinedScore: scoreComponent,
      sourceType: sourceComponent,
      docSize: sizeComponent,
      docType: typeComponent,
      freshness: freshnessComponent,
      total: priorityScore
    });
  }

  const prioritized = [...candidates].sort((a, b) => {
    return (scores.get(b.id) || 0) - (scores.get(a.id) || 0);
  });

  const log = prioritized.map(s => ({
    id: s.id,
    priorityScore: scores.get(s.id),
    breakdown: breakdowns.get(s.id)
  }));

  return { prioritized, log };
}

function _sizeScore(candidate) {
  const len = (candidate.content || '').length;
  if (len === 0) return 0;
  if (len < 200) return 1.0;
  if (len < 1000) return 0.8;
  if (len < 5000) return 0.5;
  return 0.2;
}

function _docTypeScore(candidate) {
  const category = candidate.meta.type || 'general';
  return config.priority.docTypeBoost[category] || config.priority.docTypeBoost.general;
}

function _freshnessScore(candidate) {
  if (!candidate.meta.createdAt) return 0.5;
  const age = Date.now() - new Date(candidate.meta.createdAt).getTime();
  const days = age / (1000 * 60 * 60 * 24);
  if (days < 7) return 1.0;
  if (days < 30) return 0.8;
  if (days < 90) return 0.6;
  if (days < 365) return 0.4;
  return 0.2;
}

module.exports = { prioritizeSources };