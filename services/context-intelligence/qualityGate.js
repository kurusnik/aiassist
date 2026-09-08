const { config } = require('./config');

function applyQualityGate(documents) {
  if (!config.qualityGate.enabled) {
    return {
      passed: documents,
      dropped: [],
      log: []
    };
  }

  const threshold = config.qualityGate.minCombinedScore;
  const passed = [];
  const dropped = [];
  const log = [];

  for (const doc of documents) {
    const score = doc.combinedScore || 0;
    if (score >= threshold) {
      passed.push(doc);
      log.push({ id: doc.id, combinedScore: score, threshold, passed: true });
    } else {
      dropped.push(doc);
      log.push({ id: doc.id, combinedScore: score, threshold, passed: false, reason: `combinedScore ${score.toFixed(3)} below threshold ${threshold}` });
    }
  }

  return { passed, dropped, log };
}

module.exports = { applyQualityGate };