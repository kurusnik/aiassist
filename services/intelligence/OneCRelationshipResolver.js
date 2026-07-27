/**
 * OneCRelationshipResolver — builds relationship graphs between 1C metadata objects.
 *
 * Takes normalized entities and relatedEntities, then constructs a graph
 * of joins needed to fulfill a business query.
 *
 * Input:
 *   {
 *     entity: "продажи",
 *     relatedEntities: ["бренд"],
 *     operation: "aggregate",
 *     rootObject: "Документ.РеализацияТоваровУслуг"  // optional, from translator
 *   }
 *
 * Output:
 *   {
 *     graph: {
 *       root: { object: "Документ.РеализацияТоваровУслуг" },
 *       joins: [
 *         { from: "Товары.Номенклатура", to: "Справочник.Номенклатура", relation: "reference" },
 *         { from: "Номенклатура", field: "ДополнительныеРеквизиты.Бренд" }
 *       ]
 *     },
 *     dimensions: ["Бренд"],
 *     resources: ["Сумма"],
 *     confidence: 0.91,
 *     trace: { ... }
 *   }
 *
 * Knowledge sources (in priority order):
 *   1. semantic_mappings (user confirmed)
 *   2. semantic_relationships (DB stored)
 *   3. semantic_corrections (user corrections)
 *   4. semantic_examples (historical queries)
 *   5. project RAG
 *   6. global RAG
 *   7. MCP metadata discovery
 */

const pool = require('../../db');

const RELATION_TYPE_PRIORITY = {
  table_part: 10,
  reference: 8,
  dimension: 7,
  attribute: 6,
  foreign_key: 9,
};

class OneCRelationshipResolver {
  constructor() {
    this._trace = null;
  }

  /**
   * Resolve relationships for a business query.
   *
   * @param {object} params
   * @param {string} params.entity - Canonical entity (e.g., "продажи")
   * @param {string[]} params.relatedEntities - Related terms (e.g., ["бренд"])
   * @param {string} params.operation - Semantic operation (e.g., "aggregate")
   * @param {string|null} params.rootObject - Known root 1C object (e.g., "Документ.РеализацияТоваровУслуг")
   * @param {number|null} params.projectId - Project scope
   * @returns {Promise<object>} Relationship graph
   */
  async resolve({ entity, relatedEntities, operation, rootObject, projectId }) {
    const trace = {
      stage: 'RelationshipResolver',
      input: { entity, relatedEntities, operation, rootObject, projectId },
      steps: [],
      output: null,
    };

    if (!entity) {
      const emptyResult = this._emptyResult('no_entity');
      trace.output = emptyResult;
      this._trace = trace;
      console.log(`[RelationshipResolver] empty: no entity`);
      return emptyResult;
    }

    const entityLower = entity.toLowerCase();
    const related = (relatedEntities || []).map(e => e.toLowerCase());
    const allLookups = [entityLower, ...related];

    // Step 1: Find relationships from semantic_graph_edges (Knowledge Graph)
    const graphEdges = await this._findRelationsFromGraph(allLookups, projectId);
    trace.steps.push({ step: 'graph_edges', count: graphEdges.length });

    // Step 2: Find relationships from semantic_relationships table
    const dbRelations = await this._findRelationsFromDB(allLookups, projectId);
    trace.steps.push({ step: 'db_relations', count: dbRelations.length,
      relations: dbRelations.map(r => ({ from: r.from_object, to: r.to_object, type: r.relation_type })) });

    // Step 3: Find relationships from semantic_mappings (resolved objects)
    const mappingRelations = await this._findRelationsFromMappings(allLookups, projectId);
    trace.steps.push({ step: 'mapping_relations', count: mappingRelations.length });

    // Step 4: Merge and deduplicate relations (graph > manual > mappings)
    const allRelations = this._mergeAllRelations(graphEdges, dbRelations, mappingRelations);
    trace.steps.push({ step: 'merged', count: allRelations.length });

    // Step 4: Build the graph
    const graph = this._buildGraph(entityLower, related, allRelations, rootObject);
    trace.steps.push({ step: 'graph_built', root: graph.root.object, joinCount: graph.joins.length });

    // Step 5: Infer dimensions and resources from the graph
    const { dimensions, resources } = this._inferDimensionsResources(graph, related, operation);
    trace.steps.push({ step: 'dimensions_inferred', dimensions, resources });

    // Step 6: Compute confidence
    const confidence = this._computeConfidence(allRelations, dbRelations, mappingRelations);
    trace.steps.push({ step: 'confidence', value: confidence });

    const bestSource = graphEdges.length > 0 ? 'semantic_graph' : (dbRelations.length > 0 ? 'semantic_relationships' : (mappingRelations.length > 0 ? 'semantic_mappings' : 'inferred'));

    const result = {
      graph,
      dimensions,
      resources,
      confidence,
      source: bestSource,
      trace,
    };

    trace.output = {
      rootObject: graph.root.object,
      joinCount: graph.joins.length,
      joins: graph.joins,
      dimensions,
      resources,
      confidence,
    };

    this._trace = trace;

    console.log(`[RelationshipResolver]`);
    console.log(`  root: ${graph.root.object || 'none'}`);
    console.log(`  relations: ${allRelations.length}`);
    console.log(`  joins: ${graph.joins.length}`);
    for (const join of graph.joins) {
      console.log(`    ${join.from} → ${join.to || join.field || '?'} [${join.relation}]`);
    }
    console.log(`  dimensions: ${JSON.stringify(dimensions)}`);
    console.log(`  resources: ${JSON.stringify(resources)}`);
    console.log(`  confidence: ${confidence}`);

    return result;
  }

  // ── DB lookups ─────────────────────────────────────────────────

  async _findRelationsFromGraph(concepts, projectId) {
    if (!concepts || concepts.length === 0) return [];

    try {
      const sql = `
        SELECT e.relation_type, e.field_name, e.confidence,
               fn.concept AS from_concept, fn.object_name AS from_object,
               tn.concept AS to_concept, tn.object_name AS to_object
        FROM semantic_graph_edges e
        JOIN semantic_graph_nodes fn ON fn.id = e.from_node
        JOIN semantic_graph_nodes tn ON tn.id = e.to_node
        WHERE (fn.concept = ANY($1) OR tn.concept = ANY($1))
          AND e.approved = TRUE
          AND (e.project_id = $2 OR e.project_id IS NULL)
        ORDER BY e.confidence DESC
      `;
      const result = await pool.query(sql, [concepts, projectId || null]);
      return result.rows;
    } catch (err) {
      console.log(`[RelationshipResolver] _findRelationsFromGraph error: ${err.message}`);
      return [];
    }
  }

  async _findRelationsFromDB(concepts, projectId) {
    if (!concepts || concepts.length === 0) return [];

    try {
      const sql = `
        SELECT sr.*,
               CASE WHEN sr.project_id = $1 THEN 1 ELSE 0 END AS is_project,
               CASE WHEN sr.project_id IS NULL THEN 1 ELSE 0 END AS is_global
        FROM semantic_relationships sr
        WHERE sr.from_concept = ANY($2)
           OR sr.to_concept = ANY($2)
        ORDER BY sr.confidence DESC, is_project DESC, is_global DESC
      `;
      const result = await pool.query(sql, [projectId || null, concepts]);
      return result.rows;
    } catch (err) {
      console.log(`[RelationshipResolver] _findRelationsFromDB error: ${err.message}`);
      return [];
    }
  }

  async _findRelationsFromMappings(concepts, projectId) {
    if (!concepts || concepts.length === 0) return [];

    try {
      // Find mappings for the concepts, then infer relationships from object names
      const sql = `
        SELECT sm.metadata_object, sm.metadata_field, sm.concept_id,
               c.name AS concept_name, sm.confidence
        FROM semantic_mappings sm
        JOIN semantic_concepts c ON c.id = sm.concept_id
        WHERE c.name = ANY($1)
          AND (sm.project_id = $2 OR sm.project_id IS NULL)
          AND sm.approved = TRUE
        ORDER BY sm.confidence DESC
      `;
      const result = await pool.query(sql, [concepts, projectId || null]);
      return result.rows;
    } catch (err) {
      console.log(`[RelationshipResolver] _findRelationsFromMappings error: ${err.message}`);
      return [];
    }
  }

  // ── Graph building ─────────────────────────────────────────────

  _mergeAllRelations(graphEdges, dbRelations, mappingRelations) {
    const seen = new Set();
    const merged = [];

    // Priority 1: graph edges (from Knowledge Layer mining)
    for (const e of graphEdges) {
      const key = `${e.from_object}|${e.relation_type}|${e.to_object}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({
          from: e.from_object,
          fromField: e.field_name,
          to: e.to_object,
          toField: null,
          relation: e.relation_type,
          confidence: e.confidence,
          fromConcept: e.from_concept,
          toConcept: e.to_concept,
        });
      }
    }

    // Priority 2: manual semantic_relationships
    for (const r of dbRelations) {
      const key = `${r.from_object}|${r.relation_type}|${r.to_object}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({
          from: r.from_object,
          fromField: r.from_field,
          to: r.to_object,
          toField: r.to_field,
          relation: r.relation_type,
          confidence: r.confidence,
          fromConcept: r.from_concept,
          toConcept: r.to_concept,
        });
      }
    }

    // Priority 3: semantic_mappings
    for (const m of mappingRelations) {
      const key = `mapping|${m.concept_name}|${m.metadata_object}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({
          from: m.concept_name,
          fromField: null,
          to: m.metadata_object,
          toField: m.metadata_field,
          relation: 'reference',
          confidence: m.confidence,
          fromConcept: m.concept_name,
          toConcept: m.concept_name,
        });
      }
    }

    return merged;
  }

  _buildGraph(entity, related, relations, knownRootObject) {
    const graph = {
      root: { object: knownRootObject || null },
      joins: [],
    };

    if (relations.length === 0) {
      return graph;
    }

    // Find root object: prefer from the entity's relation that has a full object name
    if (!graph.root.object) {
      for (const r of relations) {
        if (r.fromConcept === entity && r.from && r.from.includes('.')) {
          graph.root.object = r.from;
          break;
        }
        if (r.toConcept === entity && r.to && r.to.includes('.')) {
          graph.root.object = r.to;
          break;
        }
      }
    }

    // Build joins for each related entity
    for (const rel of related) {
      // Find all relations that mention this related concept
      const relRelations = relations.filter(r =>
        r.toConcept === rel || r.fromConcept === rel
      ).sort((a, b) => {
        const prioA = RELATION_TYPE_PRIORITY[a.relation] || 0;
        const prioB = RELATION_TYPE_PRIORITY[b.relation] || 0;
        return prioB - prioA;
      });

      if (relRelations.length > 0) {
        const best = relRelations[0];

        // If this relation directly connects from the root entity
        if (best.fromConcept === entity || best.fromConcept === rel) {
          // Has a field on the root object (e.g., "Документ.РеализацияТоваровУслуг.Контрагент")
          if (best.fromField && best.from && best.from.includes('.')) {
            graph.joins.push({
              from: best.from,
              field: best.fromField,
              relation: best.relation,
              toConcept: rel,
            });
          }
          // Points to a separate 1C object
          else if (best.to && best.to.includes('.')) {
            graph.joins.push({
              from: graph.root.object || best.from,
              to: best.to,
              relation: best.relation,
              toConcept: rel,
            });
          }
        }
        // Relation is from a different concept chain
        else {
          // Check if we need an intermediate join
          const intermediate = this._findIntermediateJoin(entity, rel, relations);
          if (intermediate) {
            graph.joins.push(intermediate);
          }
          if (best.to && best.to.includes('.')) {
            graph.joins.push({
              from: intermediate ? intermediate.to : (graph.root.object || entity),
              to: best.to,
              relation: best.relation,
              toConcept: rel,
            });
          } else if (best.fromField) {
            graph.joins.push({
              from: graph.root.object || entity,
              field: best.fromField,
              relation: best.relation,
              toConcept: rel,
            });
          }
        }
      }
    }

    return graph;
  }

  _findIntermediateJoin(fromConcept, toConcept, relations) {
    // Look for a chain: fromConcept → intermediate → toConcept
    for (const r1 of relations) {
      if (r1.fromConcept !== fromConcept) continue;
      if (r1.relation !== 'table_part') continue;

      for (const r2 of relations) {
        if (r2.fromConcept !== toConcept) continue;
        if (r2.to !== r1.to && r2.from !== r1.to) continue;

        return {
          from: r1.from,
          to: r1.to,
          relation: r1.relation,
          toConcept: r1.toConcept,
        };
      }
    }
    return null;
  }

  _extractObjectType(metadataObject) {
    if (!metadataObject) return null;
    const parts = metadataObject.split('.');
    if (parts.length >= 2) {
      const types = ['Документ', 'Справочник', 'РегистрНакопления', 'РегистрСведений',
                     'РегистрБухгалтерии', 'Перечисление', 'ПланВидовХарактеристик'];
      if (types.includes(parts[0])) {
        return parts[0];
      }
    }
    return null;
  }

  // ── Dimensions & resources inference ────────────────────────────

  _inferDimensionsResources(graph, related, operation) {
    const dimensions = [];
    const resources = [];

    // Each related entity becomes a dimension
    for (const rel of related) {
      dimensions.push(this._capitalizeFirst(rel));
    }

    // Default resources based on operation
    if (operation === 'aggregate') {
      resources.push('Сумма');
    } else if (operation === 'balance') {
      resources.push('Количество');
    } else if (operation === 'count') {
      resources.push('Количество');
    }

    // Check if any join suggests specific fields
    for (const join of graph.joins) {
      if (join.field) {
        const fieldName = join.field.split('.').pop();
        if (!dimensions.includes(fieldName)) {
          dimensions.push(fieldName);
        }
      }
    }

    return { dimensions, resources };
  }

  _capitalizeFirst(str) {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // ── Confidence ─────────────────────────────────────────────────

  _computeConfidence(allRelations, dbRelations, mappingRelations) {
    if (allRelations.length === 0) return 0;

    let totalConfidence = 0;
    let count = 0;

    for (const r of allRelations) {
      totalConfidence += r.confidence || 0.8;
      count++;
    }

    const baseConfidence = count > 0 ? totalConfidence / count : 0;

    // Bonus for DB-stored relationships
    const dbBonus = dbRelations.length > 0 ? 0.1 : 0;

    return Math.round(Math.min(baseConfidence + dbBonus, 1) * 100) / 100;
  }

  // ── Helpers ────────────────────────────────────────────────────

  _emptyResult(reason) {
    return {
      graph: { root: { object: null }, joins: [] },
      dimensions: [],
      resources: [],
      confidence: 0,
      source: 'none',
      trace: { reason },
    };
  }

  getLastTrace() {
    return this._trace || null;
  }
}

module.exports = OneCRelationshipResolver;
