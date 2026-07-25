const { config } = require('./config');

function applyTokenBudget(candidates) {
  const maxChars = config.tokenBudget.maxContextChars;
  const docOverhead = config.tokenBudget.docOverhead;

  let usedChars = 0;
  const included = [];
  const excluded = [];
  const log = [];

  for (const c of candidates) {
    const estimatedChars = (c.content || '').length + docOverhead;
    if (usedChars + estimatedChars <= maxChars) {
      included.push(c);
      usedChars += estimatedChars;
      log.push({
        id: c.id,
        action: 'included',
        estimatedChars,
        totalUsed: usedChars,
        remaining: maxChars - usedChars
      });
    } else {
      excluded.push(c);
      log.push({
        id: c.id,
        action: 'excluded_by_budget',
        estimatedChars,
        totalUsed: usedChars,
        reason: `Would exceed budget: ${usedChars + estimatedChars} > ${maxChars}`
      });
    }
  }

  return {
    included,
    excluded,
    stats: {
      maxChars,
      usedByCandidates: usedChars,
      candidatesIncluded: included.length,
      candidatesExcluded: excluded.length
    },
    log
  };
}

module.exports = { applyTokenBudget };