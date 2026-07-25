class CandidateValidator {
  validate(candidates) {
    const valid = [];
    const rejected = [];

    for (const c of candidates) {
      const errors = [];

      if (!c.id || typeof c.id !== 'string') {
        errors.push('missing or invalid id');
      }

      if (!c.content || typeof c.content !== 'string') {
        errors.push('missing or invalid content');
      }

      if (typeof c.score !== 'number' || c.score < 0 || c.score > 1) {
        errors.push('score must be a number between 0 and 1');
      }

      if (!c.meta || !c.meta.source) {
        errors.push('missing meta.source');
      }

      if (errors.length === 0) {
        valid.push(c);
      } else {
        rejected.push({
          id: c.id || 'unknown',
          reason: errors.join('; ')
        });
      }
    }

    return { valid, rejected };
  }
}

module.exports = CandidateValidator;