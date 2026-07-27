/**
 * OneCBusinessConceptMiner — maps 1C metadata objects to business concepts.
 *
 * Analyzes object names, types, synonyms and generates business concept candidates.
 * Does NOT auto-apply — only generates suggestions for user confirmation.
 *
 * Sources for concept inference:
 *   1. Object synonym (from Knowledge Layer)
 *   2. Object name pattern (e.g., "РеализацияТоваровУслуг" → "реализация")
 *   3. Existing semantic_concepts and semantic_aliases
 *   4. semantic_mappings (if object already has a mapping)
 *
 * Output: semantic_suggestions (pending) or semantic_graph_nodes (auto-approved when high confidence)
 */

const pool = require('../../db');

// Russian noun patterns for concept extraction
const OBJECT_SUFFIXES = [
  'ТоваровУслуг', 'Товаров', 'Услуг',
  'Клиентов', 'Контрагентов', 'Организаций',
  'Номенклатуры', 'Складов', 'Партий',
  'Заказов', 'Счетов', 'Документов',
  'Движений', 'Остатков', 'Оборотов',
  'Видов', 'Типов', 'Категорий',
];

const TYPE_TO_NODE_TYPE = {
  'Документ': 'document',
  'Справочник': 'catalog',
  'РегистрНакопления': 'register',
  'РегистрСведений': 'register',
  'РегистрБухгалтерии': 'register',
  'Перечисление': 'enum',
  'ПланВидовХарактеристик': 'catalog',
  'Обработка': 'processing',
  'Отчет': 'report',
};

class OneCBusinessConceptMiner {
  /**
   * Mine business concepts for a set of metadata objects.
   *
   * @param {object} opts
   * @param {string[]} opts.objectNames - Full object names (e.g., ["Документ.РеализацияТоваровУслуг"])
   * @param {number|null} opts.projectId
   * @returns {Promise<{ nodes: object[], suggestions: object[] }>}
   */
  async mine({ objectNames, projectId }) {
    const trace = { stage: 'BusinessConceptMiner', input: { objectNames: objectNames.length }, steps: [] };
    const nodes = [];
    const suggestions = [];

    for (const fullName of objectNames) {
      if (!fullName || !fullName.includes('.')) continue;

      const parts = fullName.split('.');
      const objectType = parts[0];
      const objectName = parts.slice(1).join('.');

      // Step 1: Extract concept candidates
      const candidates = this._extractCandidates(fullName, objectType, objectName);
      trace.steps.push({ step: 'candidates', object: fullName, candidates: candidates.map(c => c.concept) });

      // Step 2: Check existing semantic_concepts
      const existingConcept = await this._findExistingConcept(candidates);

      // Step 3: Determine best concept
      let bestConcept;
      let confidence;
      let source;

      if (existingConcept) {
        bestConcept = existingConcept.name;
        confidence = Math.min(existingConcept.confidence + 0.1, 1);
        source = 'existing_concept';
        trace.steps.push({ step: 'existing_match', object: fullName, concept: bestConcept, confidence });
      } else {
        const best = candidates[0];
        if (best) {
          bestConcept = best.concept;
          confidence = best.confidence;
          source = 'name_inference';
          trace.steps.push({ step: 'inferred', object: fullName, concept: bestConcept, confidence });
        } else {
          trace.steps.push({ step: 'no_candidate', object: fullName });
          continue;
        }
      }

      // Step 4: Create node
      const nodeType = TYPE_TO_NODE_TYPE[objectType] || 'metadata_object';
      nodes.push({ concept: bestConcept, objectName: fullName, nodeType, confidence, source });

      // Step 5: If confidence < 0.8, create suggestion instead of auto-approving
      if (confidence < 0.8) {
        suggestions.push({
          term: bestConcept,
          suggested_mapping: fullName,
          confidence,
          source: 'concept_mining',
        });
      }
    }

    trace.output = { nodes: nodes.length, suggestions: suggestions.length };
    this._trace = trace;

    console.log(`[BusinessConceptMiner] Mined ${nodes.length} nodes, ${suggestions.length} suggestions`);

    return { nodes, suggestions };
  }

  // ── Candidate extraction ───────────────────────────────────────

  _extractCandidates(fullName, objectType, objectName) {
    const candidates = [];
    const lowerName = objectName.toLowerCase();

    // Primary: full object name lowercase
    candidates.push({
      concept: lowerName,
      confidence: 0.7,
      reason: 'object_name',
    });

    // Remove common suffixes to get root concept
    let root = lowerName;
    for (const suffix of OBJECT_SUFFIXES) {
      if (root.endsWith(suffix.toLowerCase())) {
        const trimmed = root.slice(0, -suffix.length);
        if (trimmed.length > 2) {
          candidates.push({
            concept: trimmed,
            confidence: 0.65,
            reason: 'suffix_removal',
          });
          break;
        }
      }
    }

    // Try to split CamelCase
    const camelParts = this._splitCamelCase(objectName);
    if (camelParts.length > 1) {
      // First meaningful part is usually the concept
      const firstPart = camelParts[0].toLowerCase();
      if (firstPart.length > 2) {
        candidates.push({
          concept: firstPart,
          confidence: 0.6,
          reason: 'camel_case',
        });
      }

      // Last part might also be meaningful
      const lastPart = camelParts[camelParts.length - 1].toLowerCase();
      if (lastPart.length > 2 && lastPart !== firstPart) {
        candidates.push({
          concept: lastPart,
          confidence: 0.55,
          reason: 'camel_case_last',
        });
      }
    }

    // Deduplicate
    const seen = new Set();
    return candidates.filter(c => {
      if (seen.has(c.concept)) return false;
      seen.add(c.concept);
      return true;
    });
  }

  _splitCamelCase(str) {
    // Split by uppercase boundaries: "РеализацияТоваровУслуг" → ["Реализация", "Товаров", "Услуг"]
    return str.replace(/([а-яА-ЯёЁa-zA-Z])([А-ЯЁ])/g, '$1 $2').split(/\s+/).filter(s => s.length > 0);
  }

  // ── Existing concept lookup ────────────────────────────────────

  async _findExistingConcept(candidates) {
    for (const c of candidates) {
      try {
        const result = await pool.query(
          `SELECT c.name, COALESCE(m.avg_conf, 0.7) AS confidence
           FROM semantic_concepts c
           LEFT JOIN (SELECT concept_id, AVG(confidence) AS avg_conf FROM semantic_mappings GROUP BY concept_id) m ON m.concept_id = c.id
           WHERE c.name = $1
           LIMIT 1`,
          [c.concept]
        );
        if (result.rows.length > 0) {
          return result.rows[0];
        }
      } catch (err) {
        // Continue
      }
    }
    return null;
  }

  getLastTrace() {
    return this._trace;
  }
}

module.exports = OneCBusinessConceptMiner;
