const { config } = require('./config');

function coordinateSources(ragDocuments, knowledgeObjects) {
  const log = [];
  const conflicts = [];

  const enhancedDocs = ragDocuments.map(doc => {
    const p = doc.provenance || [];
    let sourceType = 'fts';
    if (p.includes('vector') && p.includes('fts')) sourceType = 'both';
    else if (p.includes('vector')) sourceType = 'vector';

    return {
      ...doc,
      _sourceType: sourceType,
      _sourceGroup: 'rag',
      _knowledgeObj: null
    };
  });

  const enhancedKnowledge = knowledgeObjects.map(obj => ({
    id: `knowledge:${obj.full_name || obj.name}`,
    content: obj.full_name + (obj.synonym ? ` (${obj.synonym})` : '') + (obj.comment ? ` — ${obj.comment}` : ''),
    combinedScore: 0.3,
    _sourceType: 'knowledge',
    _sourceGroup: 'knowledge',
    _knowledgeObj: obj,
    provenance: ['knowledge'],
    explanation: { knowledge: { raw: 1, normalized: 1, weight: config.priority.weights.sourceType }, combined: 0.3 },
    vectorScoreNormalized: 0,
    ftsScoreNormalized: 0
  }));

  for (const doc of enhancedDocs) {
    for (const kn of enhancedKnowledge) {
      const knName = kn._knowledgeObj.full_name || kn._knowledgeObj.name;
      if (doc.content && knName && doc.content.toLowerCase().includes(knName.toLowerCase())) {
        conflicts.push({
          ragDocId: doc.id,
          knowledgeObjName: knName,
          ragScore: doc.combinedScore,
          knowledgeScore: kn.combinedScore,
          resolved: doc.combinedScore >= kn.combinedScore ? 'rag' : 'knowledge'
        });
      }
    }
  }

  const allSources = [...enhancedDocs, ...enhancedKnowledge];

  allSources.sort((a, b) => {
    const aBoost = config.priority.sourceTypeBoost[a._sourceType] || 0.5;
    const bBoost = config.priority.sourceTypeBoost[b._sourceType] || 0.5;
    return (b.combinedScore * bBoost) - (a.combinedScore * aBoost);
  });

  log.push({
    ragCount: ragDocuments.length,
    knowledgeCount: knowledgeObjects.length,
    totalAfterCoordination: allSources.length,
    conflictsFound: conflicts.length
  });

  return { sources: allSources, log, conflicts };
}

module.exports = { coordinateSources };