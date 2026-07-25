const { config } = require('./config');

function deduplicate(candidates) {
  if (!config.dedup.enabled) {
    return {
      documents: candidates,
      removed: [],
      log: []
    };
  }

  const seen = new Map();
  const deduped = [];
  const removed = [];
  const log = [];

  for (const c of candidates) {
    const existing = seen.get(c.id);
    if (existing) {
      const keep = c.score >= existing.score ? c : existing;
      const discard = c.score >= existing.score ? existing : c;
      seen.set(c.id, keep);
      removed.push(discard);
      log.push({
        id: c.id,
        action: 'dedup_by_id',
        keptScore: keep.score,
        removedScore: discard.score
      });
      continue;
    }

    const similar = _findSimilar(c, deduped);
    if (similar) {
      const keep = c.score >= similar.score ? c : similar;
      const discard = c.score >= similar.score ? similar : c;
      const idx = deduped.indexOf(similar);
      if (idx >= 0) {
        if (keep === c) {
          deduped[idx] = c;
        }
      } else {
        deduped.push(keep);
      }
      removed.push(discard);
      log.push({
        id: c.id,
        action: 'dedup_by_similarity',
        keptScore: keep.score,
        removedScore: discard.score,
        similarToId: similar.id
      });
      continue;
    }

    seen.set(c.id, c);
    deduped.push(c);
  }

  return { documents: deduped, removed, log };
}

function _findSimilar(candidate, candidates) {
  if (!candidate.content || candidate.content.length < 20) return null;
  const words = new Set(candidate.content.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (words.size === 0) return null;

  for (const existing of candidates) {
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