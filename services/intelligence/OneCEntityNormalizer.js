/**
 * OneCEntityNormalizer — normalizes extracted business entities to canonical form.
 *
 * Receives an entity from QueryInterpreter and resolves it to its canonical
 * concept name using semantic_concepts, semantic_aliases, and semantic_mappings.
 *
 * Example:
 *   Input:  "реализации"
 *   Output: { canonical: "реализация", concept: "sales_document", confidence: 0.95 }
 *
 * Usage:
 *   const normalizer = new OneCEntityNormalizer();
 *   const result = await normalizer.normalize("реализации", { projectId: 1 });
 */

const pool = require('../../db');

class OneCEntityNormalizer {
  /**
   * Normalize an entity string to its canonical form.
   *
   * @param {string} entity - Raw entity from QueryInterpreter (e.g., "реализации")
   * @param {object} context - { projectId }
   * @returns {Promise<{ canonical: string, concept: string, confidence: number, source: string }>}
   */
  async normalize(entity, context = {}) {
    const trace = { stage: 'Entity Normalizer', input: entity, steps: [] };

    if (!entity || typeof entity !== 'string') {
      trace.steps.push({ step: 'validate', result: 'empty_input' });
      return { canonical: entity || '', concept: null, confidence: 0, source: 'none', trace };
    }

    const raw = entity.toLowerCase().trim();
    const projectId = context.projectId || null;

    // Step 1: Exact match in semantic_concepts
    const exactConcept = await this._findExactConcept(raw);
    if (exactConcept) {
      trace.steps.push({ step: 'exact_concept', result: 'found', concept: exactConcept.name, confidence: exactConcept.confidence });
      return {
        canonical: exactConcept.name,
        concept: exactConcept.name,
        confidence: exactConcept.confidence,
        source: 'semantic_concept',
        trace,
      };
    }

    // Step 2: Alias match in semantic_aliases
    const aliasConcept = await this._findAliasConcept(raw);
    if (aliasConcept) {
      trace.steps.push({ step: 'alias_match', result: 'found', alias: raw, concept: aliasConcept.name, confidence: aliasConcept.confidence });
      return {
        canonical: aliasConcept.name,
        concept: aliasConcept.name,
        confidence: aliasConcept.confidence,
        source: 'semantic_alias',
        trace,
      };
    }

    // Step 3: LIKE match in semantic_concepts (partial match)
    const likeConcept = await this._findLikeConcept(raw);
    if (likeConcept) {
      trace.steps.push({ step: 'like_match', result: 'found', input: raw, concept: likeConcept.name, confidence: likeConcept.confidence });
      return {
        canonical: likeConcept.name,
        concept: likeConcept.name,
        confidence: likeConcept.confidence,
        source: 'semantic_concept_like',
        trace,
      };
    }

    // Step 4: Match via semantic_mappings.business_term
    const businessTerm = await this._findBusinessTerm(raw, projectId);
    if (businessTerm) {
      trace.steps.push({ step: 'business_term', result: 'found', concept: businessTerm.concept_name, confidence: businessTerm.confidence });
      return {
        canonical: businessTerm.concept_name,
        concept: businessTerm.concept_name,
        confidence: businessTerm.confidence,
        source: 'business_term',
        trace,
      };
    }

    // Step 5: No match — return original entity with low confidence
    trace.steps.push({ step: 'fallback', result: 'no_match', entity: raw });
    return {
      canonical: raw,
      concept: null,
      confidence: 0,
      source: 'none',
      trace,
    };
  }

  // ── Private DB lookups ─────────────────────────────────────────

  async _findExactConcept(name) {
    try {
      const result = await pool.query(
        `SELECT c.id, c.name, COALESCE(m.avg_conf, 0.8) AS confidence
         FROM semantic_concepts c
         LEFT JOIN (
           SELECT concept_id, AVG(confidence) AS avg_conf
           FROM semantic_mappings WHERE approved = TRUE
           GROUP BY concept_id
         ) m ON m.concept_id = c.id
         WHERE c.name = $1
         LIMIT 1`,
        [name]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.log(`[EntityNormalizer] _findExactConcept error: ${err.message}`);
      return null;
    }
  }

  async _findAliasConcept(alias) {
    try {
      const result = await pool.query(
        `SELECT c.id, c.name, COALESCE(m.avg_conf, 0.7) AS confidence
         FROM semantic_aliases a
         JOIN semantic_concepts c ON c.id = a.concept_id
         LEFT JOIN (
           SELECT concept_id, AVG(confidence) AS avg_conf
           FROM semantic_mappings WHERE approved = TRUE
           GROUP BY concept_id
         ) m ON m.concept_id = c.id
         WHERE a.alias = $1
         LIMIT 1`,
        [alias]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.log(`[EntityNormalizer] _findAliasConcept error: ${err.message}`);
      return null;
    }
  }

  async _findLikeConcept(entity) {
    try {
      const result = await pool.query(
        `SELECT c.id, c.name, COALESCE(m.avg_conf, 0.6) AS confidence
         FROM semantic_concepts c
         LEFT JOIN (
           SELECT concept_id, AVG(confidence) AS avg_conf
           FROM semantic_mappings WHERE approved = TRUE
           GROUP BY concept_id
         ) m ON m.concept_id = c.id
         WHERE c.name LIKE '%' || $1 || '%'
            OR $1 LIKE '%' || c.name || '%'
         ORDER BY LENGTH(c.name) DESC
         LIMIT 1`,
        [entity]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.log(`[EntityNormalizer] _findLikeConcept error: ${err.message}`);
      return null;
    }
  }

  async _findBusinessTerm(term, projectId) {
    try {
      const sql = `SELECT sm.business_term, c.name AS concept_name, sm.confidence
                   FROM semantic_mappings sm
                   JOIN semantic_concepts c ON c.id = sm.concept_id
                   WHERE sm.business_term = $1
                     AND (sm.project_id = $2 OR ($2 IS NULL AND sm.project_id IS NULL))
                   ORDER BY sm.confidence DESC
                   LIMIT 1`;
      const result = await pool.query(sql, [term, projectId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
      console.log(`[EntityNormalizer] _findBusinessTerm error: ${err.message}`);
      return null;
    }
  }
}

module.exports = OneCEntityNormalizer;
