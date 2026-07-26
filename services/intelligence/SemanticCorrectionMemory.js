/**
 * SemanticCorrectionMemory — stores and retrieves user corrections to AI semantic mappings.
 *
 * When a user says "Нет, у меня Бренд = ДополнительныеРеквизиты.ТорговаяМарка",
 * this module:
 *   1. Saves the correction (wrong → correct mapping)
 *   2. Finds similar past corrections for the same term
 *   3. Applies the correction to semantic_mappings (creates user_confirmation)
 *
 * Usage:
 *   const memory = new SemanticCorrectionMemory();
 *   await memory.saveCorrection({ projectId, question, wrongMapping, correctMapping, comment });
 *   const similar = await memory.findSimilarCorrections(term);
 *   await memory.applyCorrection(correctionId);
 */

const pool = require('../../db');

class SemanticCorrectionMemory {
  /**
   * Save a user correction.
   *
   * @param {object} params
   * @param {number|null} params.projectId
   * @param {string} params.question - Original user question
   * @param {string} params.wrongMapping - What the AI suggested (e.g., "Справочник.Номенклатура.Бренд")
   * @param {string} params.correctMapping - What the user says is correct (e.g., "ДополнительныеРеквизиты.ТорговаяМарка")
   * @param {string|null} params.comment - Optional user comment
   * @returns {Promise<object>} Saved correction record
   */
  async saveCorrection({ projectId, question, wrongMapping, correctMapping, comment }) {
    // Parse metadata_object from full mapping strings
    const wrongParts = this._parseMapping(wrongMapping);
    const correctParts = this._parseMapping(correctMapping);

    const result = await pool.query(
      `INSERT INTO semantic_corrections
       (project_id, question, wrong_mapping, correct_mapping,
        wrong_metadata_object, wrong_metadata_field,
        correct_metadata_object, correct_metadata_field, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        projectId || null,
        question,
        wrongMapping,
        correctMapping,
        wrongParts.object,
        wrongParts.field,
        correctParts.object,
        correctParts.field,
        comment || null,
      ]
    );

    const correction = result.rows[0];
    console.log(`[SemanticCorrectionMemory] Saved correction: "${wrongMapping}" → "${correctMapping}" (project: ${projectId || 'global'})`);

    return correction;
  }

  /**
   * Find similar corrections for a term or mapping.
   *
   * @param {string} term - Business term or metadata object to search for
   * @param {number|null} projectId - Project scope
   * @returns {Promise<Array>} List of matching corrections
   */
  async findSimilarCorrections(term, projectId) {
    if (!term) return [];

    try {
      // Search by wrong_mapping, correct_mapping, or question text
      const sql = `
        SELECT * FROM semantic_corrections
        WHERE (wrong_mapping ILIKE '%' || $1 || '%'
            OR correct_mapping ILIKE '%' || $1 || '%'
            OR question ILIKE '%' || $1 || '%'
            OR wrong_metadata_object ILIKE '%' || $1 || '%'
            OR correct_metadata_object ILIKE '%' || $1 || '%')
          AND (project_id = $2 OR ($2 IS NULL AND project_id IS NULL))
        ORDER BY created_at DESC
        LIMIT 10
      `;
      const result = await pool.query(sql, [term, projectId || null]);
      return result.rows;
    } catch (err) {
      console.log(`[SemanticCorrectionMemory] findSimilarCorrections error: ${err.message}`);
      return [];
    }
  }

  /**
   * Apply a saved correction: create/update semantic_mappings with user_confirmation.
   *
   * @param {number} correctionId - ID of the correction to apply
   * @param {number|null} projectId - Project scope
   * @returns {Promise<object>} Application result
   */
  async applyCorrection(correctionId, projectId) {
    // Fetch the correction
    const correctionResult = await pool.query(
      'SELECT * FROM semantic_corrections WHERE id = $1',
      [correctionId]
    );

    if (correctionResult.rows.length === 0) {
      return { applied: false, error: 'Correction not found' };
    }

    const correction = correctionResult.rows[0];
    const effectiveProjectId = projectId || correction.project_id;

    // Extract concept name from the question or mapping
    const conceptName = this._extractConceptFromMapping(correction.correct_mapping, correction.question);

    // Find or create concept
    let concept = await pool.query('SELECT id FROM semantic_concepts WHERE name = $1', [conceptName]);
    if (concept.rows.length === 0) {
      concept = await pool.query('INSERT INTO semantic_concepts (name) VALUES ($1) RETURNING id', [conceptName]);
    }
    const conceptId = concept.rows[0].id;

    // Check for existing mapping
    const existing = await pool.query(
      `SELECT id FROM semantic_mappings
       WHERE concept_id = $1 AND metadata_object = $2
         AND (metadata_field IS NOT DISTINCT FROM $3)
         AND project_id IS NOT DISTINCT FROM $4`,
      [conceptId, correction.correct_metadata_object, correction.correct_metadata_field, effectiveProjectId || null]
    );

    if (existing.rows.length > 0) {
      // Update existing mapping to user_confirmation
      await pool.query(
        `UPDATE semantic_mappings
         SET confidence = 1, approved = TRUE, source = 'user_confirmation', updated_at = NOW()
         WHERE id = $1`,
        [existing.rows[0].id]
      );
    } else {
      // Insert new mapping
      await pool.query(
        `INSERT INTO semantic_mappings
         (concept_id, metadata_object, metadata_field, mapping_type, confidence, approved, source, project_id, business_term)
         VALUES ($1, $2, $3, 'attribute', 1, TRUE, 'user_correction', $4, $5)`,
        [conceptId, correction.correct_metadata_object, correction.correct_metadata_field, effectiveProjectId || null, conceptName]
      );
    }

    // Delete or invalidate the wrong mapping
    if (correction.wrong_metadata_object) {
      await pool.query(
        `UPDATE semantic_mappings
         SET confidence = GREATEST(confidence - 0.5, 0), approved = FALSE
         WHERE concept_id = $1 AND metadata_object = $2
           AND project_id IS NOT DISTINCT FROM $3
           AND source != 'user_confirmation'`,
        [conceptId, correction.wrong_metadata_object, effectiveProjectId || null]
      );
    }

    console.log(`[SemanticCorrectionMemory] Applied correction ${correctionId}: ${correction.wrong_mapping} → ${correction.correct_mapping}`);

    return { applied: true, conceptId, correction };
  }

  /**
   * Get all corrections for a project (for admin review).
   */
  async getCorrections(projectId, limit = 50) {
    const sql = `
      SELECT * FROM semantic_corrections
      WHERE project_id = $1 OR ($1 IS NULL AND project_id IS NULL)
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const result = await pool.query(sql, [projectId || null, limit]);
    return result.rows;
  }

  // ── Private helpers ────────────────────────────────────────────

  _parseMapping(mapping) {
    if (!mapping) return { object: null, field: null };
    const parts = mapping.split('.');
    if (parts.length >= 2) {
      // Handle patterns like "Справочник.Номенклатура.Бренд" or "ДополнительныеРеквизиты.ТорговаяМарка"
      // Determine if the first part is a 1C type prefix
      const types = ['Справочник', 'Документ', 'РегистрНакопления', 'РегистрСведений',
                     'РегистрБухгалтерии', 'Перечисление', 'ПланВидовХарактеристик',
                     'ДополнительныеРеквизиты', 'ПланСчетов'];
      if (types.includes(parts[0])) {
        if (parts.length >= 3) {
          return { object: parts[0] + '.' + parts[1], field: parts.slice(2).join('.') };
        }
        return { object: parts[0] + '.' + parts[1], field: null };
      }
      // Not a standard type prefix — treat whole thing as object
      return { object: mapping, field: null };
    }
    return { object: mapping, field: null };
  }

  _extractConceptFromMapping(correctMapping, question) {
    // Try to extract a meaningful concept name
    // From mapping: "ДополнительныеРеквизиты.ТорговаяМарка" → "торговая марка" or "бренд"
    const parts = correctMapping.split('.');
    if (parts.length >= 2) {
      const fieldName = parts[parts.length - 1];
      // Convert to lowercase and return
      return fieldName.toLowerCase();
    }

    // Fall back to question text
    if (question) {
      const words = question.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      return words[0] || 'unknown';
    }

    return 'unknown';
  }
}

module.exports = SemanticCorrectionMemory;
