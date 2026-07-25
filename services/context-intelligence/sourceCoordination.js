const { config } = require('./config');

function coordinateSources(candidates) {
  const log = [];
  const conflicts = [];

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (a.content && b.content && a.content.toLowerCase().includes(b.content.toLowerCase()) ||
          b.content && a.content && b.content.toLowerCase().includes(a.content.toLowerCase())) {
        conflicts.push({
          idA: a.id,
          idB: b.id,
          sourceA: a.meta.source,
          sourceB: b.meta.source,
          scoreA: a.score,
          scoreB: b.score,
          resolved: a.score >= b.score ? a.id : b.id
        });
      }
    }
  }

  const sorted = [...candidates].sort((a, b) => {
    const aBoost = config.priority.sourceTypeBoost[a.meta.source] || 0.5;
    const bBoost = config.priority.sourceTypeBoost[b.meta.source] || 0.5;
    return (b.score * bBoost) - (a.score * aBoost);
  });

  log.push({
    totalBefore: candidates.length,
    totalAfterCoordination: sorted.length,
    conflictsFound: conflicts.length
  });

  return { sources: sorted, log, conflicts };
}

module.exports = { coordinateSources };