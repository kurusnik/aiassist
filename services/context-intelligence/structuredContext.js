function buildStructuredContext(candidates, excluded) {
  const primary = [];
  const supporting = [];
  const knowledge = [];

  for (const c of candidates) {
    if (c.meta.source === 'knowledge') {
      knowledge.push(c);
    } else if (c.score >= 0.3) {
      primary.push(c);
    } else {
      supporting.push(c);
    }
  }

  return {
    primary,
    supporting,
    knowledge,
    excluded,
    stats: {
      primaryCount: primary.length,
      supportingCount: supporting.length,
      knowledgeCount: knowledge.length,
      totalCandidates: candidates.length,
      totalExcluded: excluded.length
    }
  };
}

module.exports = { buildStructuredContext };