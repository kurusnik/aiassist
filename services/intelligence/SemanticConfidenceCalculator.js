/**
 * SemanticConfidenceCalculator — centralized confidence computation for the @1с pipeline.
 *
 * Replaces the scattered confidence calculations in SemanticValidator._resolveConfidence(),
 * OneCSemanticTranslator._computeConfidence(), and OneCQueryPlanner._computeConfidence()
 * with a single, transparent, traceable calculator.
 *
 * Formula:
 *   base confidence
 *   + user_confirmation bonus (0.3)
 *   + project_mapping bonus (0.2)
 *   + semantic_memory bonus (0.1)
 *   + rag_match bonus (0.05)
 *   + mcp_discovery bonus (0.05)
 *   + example_match bonus (0.1)
 *   - conflicts penalty (-0.3)
 *   - unknown_object penalty (-0.2)
 *   - missing_dimension penalty (-0.1)
 *   - ambiguous_mapping penalty (-0.15)
 *
 * Usage:
 *   const calc = new SemanticConfidenceCalculator();
 *   const result = calc.calculate({ fusionResult, translatorResult, knowledgeResult });
 *   // result.confidence, result.trace, result.breakdown
 */

class SemanticConfidenceCalculator {
  /**
   * Calculate the composite confidence score from all pipeline stages.
   *
   * @param {object} params
   * @param {object} params.fusionResult - From SemanticKnowledgeFusion / ProjectContextResolver
   * @param {object} params.translatorResult - From OneCSemanticTranslator
   * @param {object} params.knowledgeResult - From OneCKnowledgeResolver
   * @param {object} params.validationContext - Additional context: { term, warnings, corrections }
   * @returns {{ confidence: number, breakdown: object, trace: array, decision: string }}
   */
  calculate({ fusionResult, translatorResult, knowledgeResult, validationContext }) {
    const trace = [];
    const breakdown = {
      base: 0,
      bonuses: [],
      penalties: [],
      raw: 0,
      clamped: 0,
    };

    // ── Step 1: Base confidence — weighted average of all sources ──
    const fusionConf = this._getConfidence(fusionResult, 'fusion');
    const translatorConf = this._getConfidence(translatorResult, 'translator');
    const knowledgeConf = this._getConfidence(knowledgeResult, 'knowledge');

    const sources = this._getSources(fusionResult);
    const hasFusionSources = sources.length > 0;
    const hasTranslator = translatorResult && translatorResult.resolvedEntities && translatorResult.resolvedEntities.length > 0;

    // Base calculation — compatible with legacy algorithm
    let base;
    if (fusionConf >= 0.8 && hasFusionSources) {
      base = fusionConf;
      trace.push({ step: 'base_fusion_direct', value: fusionConf, reason: 'fusionConf >= 0.8 with sources' });
    } else if (hasTranslator && translatorConf > 0) {
      base = translatorConf * 0.6 + fusionConf * 0.3 + knowledgeConf * 0.1;
      base = Math.round(Math.min(base, 1) * 100) / 100;
      trace.push({ step: 'base_weighted', value: base, weights: { fusion: 0.3, translator: 0.6, knowledge: 0.1 } });
    } else {
      base = Math.round(Math.min(Math.max(fusionConf, translatorConf, knowledgeConf), 1) * 100) / 100;
      trace.push({ step: 'base_max', value: base, fusion: fusionConf, translator: translatorConf, knowledge: knowledgeConf });
    }
    breakdown.base = base;

    // ── Step 2: Source-based bonuses (small incremental boosts) ──
    for (const source of sources) {
      const bonus = this._sourceBonus(source.type, source.confidence);
      if (bonus > 0) {
        breakdown.bonuses.push({ type: `source:${source.type}`, value: bonus, confidence: source.confidence });
        trace.push({ step: `bonus_source_${source.type}`, value: bonus, sourceConfidence: source.confidence });
      }
    }

    // ── Step 3: Example match bonus ──
    if (translatorResult && translatorResult.trace && translatorResult.trace.steps) {
      const exampleStep = translatorResult.trace.steps.find(s => s.step === 'example_match');
      if (exampleStep) {
        const bonus = 0.1;
        breakdown.bonuses.push({ type: 'example_match', value: bonus, matched: exampleStep.matched });
        trace.push({ step: 'bonus_example', value: bonus, matched: exampleStep.matched });
      }
    }

    // ── Step 6: Penalties ──

    // Conflict penalty
    const hasConflict = validationContext && validationContext.warnings &&
      validationContext.warnings.some(w => w.includes('Конфликт'));
    if (hasConflict) {
      const penalty = -0.3;
      breakdown.penalties.push({ type: 'conflict', value: penalty });
      trace.push({ step: 'penalty_conflict', value: penalty });
    }

    // Unknown object penalty
    const hasResolvedEntity = translatorResult && translatorResult.resolvedEntities &&
      translatorResult.resolvedEntities.length > 0;
    if (!hasResolvedEntity) {
      const penalty = -0.2;
      breakdown.penalties.push({ type: 'unknown_object', value: penalty });
      trace.push({ step: 'penalty_unknown_object', value: penalty });
    }

    // Missing dimension penalty
    const hasMissingDim = validationContext && validationContext.warnings &&
      validationContext.warnings.some(w => w.includes('Не найдено измерение'));
    if (hasMissingDim) {
      const penalty = -0.1;
      breakdown.penalties.push({ type: 'missing_dimension', value: penalty });
      trace.push({ step: 'penalty_missing_dimension', value: penalty });
    }

    // Ambiguous mapping penalty
    const hasAmbiguous = validationContext && validationContext.warnings &&
      validationContext.warnings.some(w => w.includes('вариант'));
    if (hasAmbiguous) {
      const penalty = -0.15;
      breakdown.penalties.push({ type: 'ambiguous_mapping', value: penalty });
      trace.push({ step: 'penalty_ambiguous_mapping', value: penalty });
    }

    // ── Step 7: Final calculation ──
    const totalBonuses = breakdown.bonuses.reduce((sum, b) => sum + b.value, 0);
    const totalPenalties = breakdown.penalties.reduce((sum, p) => sum + p.value, 0);
    const raw = breakdown.base + totalBonuses + totalPenalties;
    breakdown.raw = Math.round(raw * 100) / 100;

    const clamped = Math.max(0, Math.min(1, raw));
    breakdown.clamped = Math.round(clamped * 100) / 100;

    trace.push({ step: 'final', raw: breakdown.raw, clamped: breakdown.clamped, totalBonuses, totalPenalties });

    // ── Step 8: Decision ──
    const confidence = breakdown.clamped;
    const decision = this._decide(confidence);

    return { confidence, breakdown, trace, decision };
  }

  /**
   * Legacy compatibility: returns just the confidence number (for drop-in replacement).
   */
  computeConfidence(fusionResult, translatorResult, knowledgeResult) {
    const { confidence } = this.calculate({ fusionResult, translatorResult, knowledgeResult });
    return confidence;
  }

  // ── Private helpers ────────────────────────────────────────────

  _getConfidence(result, source) {
    if (!result) return 0;
    if (typeof result.confidence === 'number') return result.confidence;
    return 0;
  }

  _getSources(fusionResult) {
    if (!fusionResult) return [];
    if (fusionResult.sources && Array.isArray(fusionResult.sources)) return fusionResult.sources;
    return [];
  }

  _sourceBonus(type, confidence) {
    // Small incremental boosts — base already has the main confidence calculation
    const bonuses = {
      'user_confirmation': 0.15,
      'project_mapping': 0.1,
      'semantic_memory': 0.05,
      'project_rag': 0.03,
      'global_rag': 0.02,
      'mcp_discovery': 0.03,
    };
    const base = bonuses[type] || 0;
    return base * Math.min(confidence, 1);
  }

  _decide(confidence) {
    if (confidence < 0.5) return 'blocked';
    if (confidence < 0.8) return 'confirmation_required';
    return 'execute';
  }
}

module.exports = SemanticConfidenceCalculator;
