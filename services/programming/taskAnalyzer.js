const ProgrammingTask = require('./Task');
const TYPE_RULES = require('./rules/typeRules');
const LANGUAGE_RULES = require('./rules/languageRules');
const DOMAIN_RULES = require('./rules/domainRules');

function extractTitle(text) {
  const cleaned = text.replace(/^(напиши|создай|сделай|разработай|объясни|проверь|измени|добавь|доработай|реализуй|модифицируй|расширь)\s*/i, '');
  return cleaned.length > 100 ? cleaned.substring(0, 100) + '...' : cleaned;
}

function classify(text, rules) {
  const lower = text.toLowerCase();
  let bestRule = null;
  let bestScore = 0;

  for (const rule of rules) {
    let score = 0;
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword)) {
        score += 1;
      }
    }
    if (rule.subkeywords) {
      for (const sub of rule.subkeywords) {
        if (lower.includes(sub)) {
          score += 2;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  }

  return bestRule;
}

class TaskAnalyzer {
  analyze(text) {
    if (!text || typeof text !== 'string') {
      return new ProgrammingTask('unknown', {
        title: null,
        language: 'unknown',
        domain: 'general',
        originalRequest: text || ''
      });
    }

    const typeRule = classify(text, TYPE_RULES);
    const languageRule = classify(text, LANGUAGE_RULES);
    const domainRule = classify(text, DOMAIN_RULES);

    const type = typeRule ? typeRule.type : 'unknown';
    const language = languageRule ? languageRule.language : 'unknown';
    const domain = domainRule ? domainRule.domain : 'general';
    const title = extractTitle(text);

    return new ProgrammingTask(type, {
      title,
      language,
      domain,
      originalRequest: text
    });
  }
}

module.exports = TaskAnalyzer;