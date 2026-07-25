const { config } = require('./config');

function normalizeResults(docs) {
  const vectorScores = docs.map(d => d.vectorScore).filter(s => s > 0);
  const ftsScores = docs.map(d => d.ftsScore).filter(s => s > 0);

  const maxVector = vectorScores.length > 0 ? Math.max(...vectorScores) : 1;
  const maxFts = ftsScores.length > 0 ? Math.max(...ftsScores) : 1;

  const normLog = [];

  for (const doc of docs) {
    const rawVector = doc.vectorScore;
    const rawFts = doc.ftsScore;

    const normVector = maxVector > 0 ? rawVector / maxVector : 0;
    const normFts = maxFts > 0 ? rawFts / maxFts : 0;

    const weightedVector = normVector * config.vector.weight;
    const weightedFts = normFts * config.fts.weight;

    doc.vectorScoreNormalized = normVector;
    doc.ftsScoreNormalized = normFts;
    doc.combinedScore = weightedVector + weightedFts;

    normLog.push({
      id: doc.id,
      rawVector: rawVector,
      rawFts: rawFts,
      normVector: normVector,
      normFts: normFts,
      weightedVector: weightedVector,
      weightedFts: weightedFts,
      combinedScore: doc.combinedScore
    });
  }

  return { normLog };
}

module.exports = { normalizeResults };