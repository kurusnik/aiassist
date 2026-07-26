class KnowledgeScorer {
  _normalizeToken(token) {
    return token.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '');
  }

  _tokenize(text) {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]/gi, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 2);
  }

  _computeTextSimilarity(tokens, text) {
    if (!tokens.length || !text) return 0;
    const lower = text.toLowerCase();
    const hits = tokens.filter(t => lower.includes(t)).length;
    return hits / tokens.length;
  }

  _computeNameMatch(knowledgeObject, queryTokens) {
    const name = knowledgeObject.name || '';
    const synonym = knowledgeObject.synonym || '';
    const fullName = knowledgeObject.full_name || '';

    const nameTokens = this._tokenize(name);
    const synonymTokens = this._tokenize(synonym);
    const fullNameTokens = this._tokenize(fullName);

    const exactNameMatch = nameTokens.some(t => queryTokens.includes(t)) ? 0.4 : 0;
    const exactSynonymMatch = synonymTokens.some(t => queryTokens.includes(t)) ? 0.3 : 0;

    const namePartial = this._computeTextSimilarity(queryTokens, name) * 0.2;
    const synonymPartial = this._computeTextSimilarity(queryTokens, synonym) * 0.15;
    const fullNamePartial = this._computeTextSimilarity(queryTokens, fullName) * 0.1;

    return Math.min(exactNameMatch + exactSynonymMatch + namePartial + synonymPartial + fullNamePartial, 0.9);
  }

  _computeCommentMatch(knowledgeObject, queryTokens) {
    const comment = knowledgeObject.comment || '';
    if (!comment) return 0;
    return this._computeTextSimilarity(queryTokens, comment) * 0.3;
  }

  _computeFieldMatch(knowledgeObject, queryTokens) {
    const fields = knowledgeObject.fields || [];
    if (!fields.length || !queryTokens.length) return 0;

    let totalScore = 0;
    for (const field of fields) {
      const fieldName = field.name || '';
      const fieldSynonym = field.synonym || '';
      const fieldType = field.datatype || '';
      const refType = field.reference_type || '';

      const fieldSimilarity = this._computeTextSimilarity(queryTokens, fieldName);
      const synonymSimilarity = this._computeTextSimilarity(queryTokens, fieldSynonym);
      const typeSimilarity = this._computeTextSimilarity(queryTokens, refType);

      totalScore += Math.max(fieldSimilarity, synonymSimilarity, typeSimilarity);
    }

    const fieldScore = fields.length > 0 ? totalScore / fields.length : 0;
    return fieldScore * 0.4;
  }

  _computeTypeMatch(knowledgeObject, queryContext) {
    const entityTypes = (queryContext.entities || []).map(e => e.type).filter(Boolean);
    if (!entityTypes.length) return 0;

    const objType = knowledgeObject.type || '';
    const objName = knowledgeObject.name || '';
    const fullName = knowledgeObject.full_name || '';

    for (const entityType of entityTypes) {
      const lowerEntity = entityType.toLowerCase();
      if (objType.toLowerCase().includes(lowerEntity)) return 0.15;
      if (objName.toLowerCase().includes(lowerEntity)) return 0.1;
      if (fullName.toLowerCase().includes(lowerEntity)) return 0.1;
    }

    return 0;
  }

  _computeIntentBoost(knowledgeObject, queryContext) {
    const intentName = queryContext.intent ? queryContext.intent.name : null;
    if (!intentName) return 0;

    const objType = (knowledgeObject.type || '').toLowerCase();
    const objName = (knowledgeObject.name || '').toLowerCase();

    switch (intentName) {
      case 'explain_concept':
        return objType === 'документ' || objType === 'справочник' ? 0.15 : 0.05;
      case 'find_field':
        return (knowledgeObject.fields || []).length > 0 ? 0.1 : 0;
      case 'search_information':
        return 0.1;
      case 'execute_action':
        return objType === 'документ' || objType === 'регистрнакопления' ? 0.1 : 0;
      default:
        return 0;
    }
  }

  score(knowledgeObject, queryContext) {
    const tokens = this._tokenize(queryContext.normalizedQuery || queryContext.rawQuery || '');

    let score = 0;

    score += this._computeNameMatch(knowledgeObject, tokens);
    score += this._computeCommentMatch(knowledgeObject, tokens);
    score += this._computeFieldMatch(knowledgeObject, tokens);
    score += this._computeTypeMatch(knowledgeObject, queryContext);
    score += this._computeIntentBoost(knowledgeObject, queryContext);

    return Math.min(Math.max(score, 0), 1);
  }

  scoreDistribution(objects, queryContext) {
    const scores = objects.map(obj => ({
      id: obj.id || obj.full_name || obj.name,
      score: this.score(obj, queryContext)
    }));

    const distribution = { '0.0-0.2': 0, '0.2-0.4': 0, '0.4-0.6': 0, '0.6-0.8': 0, '0.8-1.0': 0 };
    for (const s of scores) {
      if (s.score < 0.2) distribution['0.0-0.2']++;
      else if (s.score < 0.4) distribution['0.2-0.4']++;
      else if (s.score < 0.6) distribution['0.4-0.6']++;
      else if (s.score < 0.8) distribution['0.6-0.8']++;
      else distribution['0.8-1.0']++;
    }

    return { scores, distribution };
  }
}

module.exports = KnowledgeScorer;