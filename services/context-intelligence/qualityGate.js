const { config } = require('./config');

function applyQualityGate(candidates) {
  if (!config.qualityGate.enabled) {
    return {
      passed: candidates,
      dropped: [],
      log: []
    };
  }

  const threshold = config.qualityGate.minCombinedScore;
  const passed = [];
  const dropped = [];
  const log = [];

  for (const c of candidates) {
    const score = c.score || 0;
    if (score >= threshold) {
      passed.push(c);
      log.push({ id: c.id, score, threshold, passed: true });
    } else {
      dropped.push(c);
      log.push({ id: c.id, score, threshold, passed: false, reason: `score ${score.toFixed(3)} below threshold ${threshold}` });
    }
  }

  return { passed, dropped, log };
}

module.exports = { applyQualityGate };