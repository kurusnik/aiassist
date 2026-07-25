const { config } = require('./config');

function applyTokenBudget(sources, knowledgeObjects) {
  const maxChars = config.tokenBudget.maxContextChars;
  const reserveForKnowledge = config.tokenBudget.reserveForKnowledge;
  const docOverhead = config.tokenBudget.docOverhead;

  const availableForDocs = maxChars - reserveForKnowledge;

  let usedChars = 0;
  const included = [];
  const excluded = [];
  const log = [];

  for (const source of sources) {
    const estimatedChars = (source.content || '').length + docOverhead;
    if (usedChars + estimatedChars <= availableForDocs) {
      included.push(source);
      usedChars += estimatedChars;
      log.push({
        id: source.id,
        action: 'included',
        estimatedChars,
        totalUsed: usedChars,
        remaining: availableForDocs - usedChars
      });
    } else {
      excluded.push(source);
      log.push({
        id: source.id,
        action: 'excluded_by_budget',
        estimatedChars,
        totalUsed: usedChars,
        reason: `Would exceed budget: ${usedChars + estimatedChars} > ${availableForDocs}`
      });
    }
  }

  let knowledgeUsedChars = 0;
  const knowledgeIncluded = [];
  const knowledgeExcluded = [];

  for (const obj of knowledgeObjects) {
    const estimatedChars = ((obj.content || '').length + docOverhead);
    if (knowledgeUsedChars + estimatedChars <= reserveForKnowledge) {
      knowledgeIncluded.push(obj);
      knowledgeUsedChars += estimatedChars;
    } else {
      knowledgeExcluded.push(obj);
    }
  }

  return {
    included,
    excluded,
    knowledgeIncluded,
    knowledgeExcluded,
    stats: {
      maxChars,
      availableForDocs,
      reserveForKnowledge,
      usedByDocs: usedChars,
      usedByKnowledge: knowledgeUsedChars,
      documentsIncluded: included.length,
      documentsExcluded: excluded.length
    },
    log
  };
}

module.exports = { applyTokenBudget };