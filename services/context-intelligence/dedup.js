const { config } = require('./config');

function deduplicate(documents) {
  if (!config.dedup.enabled) {
    return {
      documents,
      removed: [],
      log: []
    };
  }

  const seen = new Map();
  const deduped = [];
  const removed = [];
  const log = [];

  for (const doc of documents) {
    const existing = seen.get(doc.id);
    if (existing) {
      const keep = doc.combinedScore >= existing.combinedScore ? doc : existing;
      const discard = doc.combinedScore >= existing.combinedScore ? existing : doc;
      seen.set(doc.id, keep);
      removed.push(discard);
      log.push({
        id: doc.id,
        action: 'dedup_by_id',
        keptScore: keep.combinedScore,
        removedScore: discard.combinedScore,
        provenance: keep.provenance
      });
      continue;
    }

    const similar = _findSimilar(doc, deduped);
    if (similar) {
      const keep = doc.combinedScore >= similar.combinedScore ? doc : similar;
      const discard = doc.combinedScore >= similar.combinedScore ? similar : doc;
      const idx = deduped.indexOf(similar);
      if (idx >= 0) {
        if (keep === doc) {
          deduped[idx] = doc;
        }
      } else {
        deduped.push(keep);
      }
      removed.push(discard);
      log.push({
        id: doc.id,
        action: 'dedup_by_similarity',
        keptScore: keep.combinedScore,
        removedScore: discard.combinedScore,
        similarToId: similar.id
      });
      continue;
    }

    seen.set(doc.id, doc);
    deduped.push(doc);
  }

  return { documents: deduped, removed, log };
}

function _findSimilar(doc, documents) {
  if (!doc.content || doc.content.length < 20) return null;
  const words = new Set(doc.content.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (words.size === 0) return null;

  for (const existing of documents) {
    if (!existing.content || existing.content.length < 20) continue;
    const existingWords = new Set(existing.content.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    if (existingWords.size === 0) continue;

    const intersection = new Set([...words].filter(w => existingWords.has(w)));
    const union = new Set([...words, ...existingWords]);
    const jaccard = intersection.size / union.size;

    if (jaccard >= config.dedup.contentSimilarityThreshold) {
      return existing;
    }
  }

  return null;
}

module.exports = { deduplicate };