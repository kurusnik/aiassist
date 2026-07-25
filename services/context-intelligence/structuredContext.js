function buildStructuredContext(included, knowledgeIncluded, excluded) {
  const primaryDocs = included.filter(d =>
    d.combinedScore >= 0.3 || (d.provenance && d.provenance.includes('vector') && d.provenance.includes('fts'))
  );
  const supportingDocs = included.filter(d =>
    d.combinedScore < 0.3 && !(d.provenance && d.provenance.includes('vector') && d.provenance.includes('fts'))
  );

  return {
    primary: primaryDocs,
    supporting: supportingDocs,
    knowledge: knowledgeIncluded,
    excluded,
    stats: {
      primaryCount: primaryDocs.length,
      supportingCount: supportingDocs.length,
      knowledgeCount: knowledgeIncluded.length,
      totalDocs: included.length,
      totalExcluded: excluded.length
    }
  };
}

module.exports = { buildStructuredContext };