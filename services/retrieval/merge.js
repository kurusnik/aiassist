const { config } = require('./config');

function mergeResults(vectorResults, ftsResults) {
  const merged = new Map();
  const mergeLog = [];

  for (const doc of vectorResults) {
    merged.set(doc.id, {
      id: doc.id,
      content: doc.content,
      metadata: doc.metadata,
      chunkIndex: doc.chunkIndex,
      createdAt: doc.createdAt,
      source: doc.source,
      provenance: ['vector'],
      vectorScore: doc.similarity || 0,
      ftsScore: 0,
      ftsRank: 0,
      combinedScore: 0
    });
  }

  for (const doc of ftsResults) {
    if (merged.has(doc.id)) {
      const existing = merged.get(doc.id);
      existing.provenance.push('fts');
      existing.ftsScore = doc.ftsScore;
      existing.ftsRank = doc.ftsRank;
    } else {
      merged.set(doc.id, {
        id: doc.id,
        content: doc.content,
        metadata: doc.metadata,
        chunkIndex: doc.chunkIndex,
        createdAt: doc.createdAt,
        source: doc.source,
        provenance: ['fts'],
        vectorScore: 0,
        ftsScore: doc.ftsScore,
        ftsRank: doc.ftsRank,
        combinedScore: 0
      });
    }
  }

  const results = Array.from(merged.values());
  for (const r of results) {
    mergeLog.push({
      id: r.id,
      provenance: r.provenance,
      vectorScore: r.vectorScore,
      ftsScore: r.ftsScore
    });
  }

  return { results, mergeLog };
}

module.exports = { mergeResults };