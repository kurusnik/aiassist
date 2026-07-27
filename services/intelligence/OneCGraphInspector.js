/**
 * OneCGraphInspector — diagnostics and explanation for Knowledge Graph decisions.
 *
 * Provides transparent reasoning about why a specific 1C object was selected,
 * what paths exist through the graph, and what business concepts are involved.
 *
 * Usage:
 *   const inspector = new OneCGraphInspector();
 *   const result = await inspector.inspectConcept('продажи');
 *   const path = await inspector.explainPath('Документ.РеализацияТоваровУслуг', 'Бренд');
 *   const route = await inspector.findBusinessRoute('продажи по брендам');
 */

const pool = require('../../db');

class OneCGraphInspector {
  constructor() {
    this._trace = null;
  }

  /**
   * Inspect a business concept — find all matching graph nodes and paths.
   *
   * @param {string} term - Business concept (e.g., "продажи")
   * @returns {Promise<object>}
   */
  async inspectConcept(term) {
    const trace = { stage: 'GraphInspector', method: 'inspectConcept', input: term, steps: [] };
    if (!term) return { concept: term, matchedNodes: [], paths: [], confidence: 0, explanation: 'Empty term', trace };

    const termLower = term.toLowerCase().trim();

    // Find matching nodes
    const nodes = await pool.query(
      `SELECT id, concept, object_name, node_type, confidence, source
       FROM semantic_graph_nodes
       WHERE concept = $1 OR concept LIKE '%' || $1 || '%'
       ORDER BY confidence DESC
       LIMIT 10`,
      [termLower]
    );
    trace.steps.push({ step: 'nodes', count: nodes.rows.length });

    // Find paths from these nodes
    const paths = [];
    for (const node of nodes.rows) {
      const edges = await pool.query(
        `SELECT e.relation_type, e.field_name, e.confidence,
                fn.concept AS from_concept, fn.object_name AS from_object,
                tn.concept AS to_concept, tn.object_name AS to_object
         FROM semantic_graph_edges e
         JOIN semantic_graph_nodes fn ON fn.id = e.from_node
         JOIN semantic_graph_nodes tn ON tn.id = e.to_node
         WHERE (e.from_node = $1 OR e.to_node = $1)
           AND e.approved = TRUE
         ORDER BY e.confidence DESC
         LIMIT 5`,
        [node.id]
      );
      if (edges.rows.length > 0) {
        paths.push({
          root: node.object_name,
          edges: edges.rows.map(e => ({
            from: e.from_object,
            to: e.to_object,
            relation: e.relation_type,
            field: e.field_name,
            confidence: e.confidence,
          })),
        });
      }
    }
    trace.steps.push({ step: 'paths', count: paths.length });

    const confidence = nodes.rows.length > 0 ? nodes.rows[0].confidence : 0;
    const explanation = this._buildConceptExplanation(termLower, nodes.rows, paths);

    const result = {
      concept: termLower,
      matchedNodes: nodes.rows.map(n => ({
        object: n.object_name,
        nodeType: n.node_type,
        confidence: n.confidence,
        source: n.source,
      })),
      paths,
      confidence,
      explanation,
      trace,
    };

    this._trace = trace;
    return result;
  }

  /**
   * Inspect a specific 1C metadata object.
   *
   * @param {string} objectName - Full object name (e.g., "Документ.РеализацияТоваровУслуг")
   * @returns {Promise<object>}
   */
  async inspectObject(objectName) {
    const trace = { stage: 'GraphInspector', method: 'inspectObject', input: objectName, steps: [] };

    // Find the node
    const nodes = await pool.query(
      `SELECT id, concept, object_name, node_type, confidence, source
       FROM semantic_graph_nodes WHERE object_name = $1`,
      [objectName]
    );
    trace.steps.push({ step: 'node', found: nodes.rows.length > 0 });

    if (nodes.rows.length === 0) {
      return { object: objectName, fields: [], relations: [], businessConcepts: [], explanation: 'Object not in graph', trace };
    }

    const node = nodes.rows[0];

    // Find all edges from/to this node
    const edges = await pool.query(
      `SELECT e.relation_type, e.field_name, e.confidence,
              fn.concept AS from_concept, fn.object_name AS from_object,
              tn.concept AS to_concept, tn.object_name AS to_object
       FROM semantic_graph_edges e
       JOIN semantic_graph_nodes fn ON fn.id = e.from_node
       JOIN semantic_graph_nodes tn ON tn.id = e.to_node
       WHERE (e.from_node = $1 OR e.to_node = $1)
         AND e.approved = TRUE
       ORDER BY e.confidence DESC`,
      [node.id]
    );
    trace.steps.push({ step: 'edges', count: edges.rows.length });

    const relations = edges.rows.map(e => ({
      direction: e.from_object === objectName ? 'outgoing' : 'incoming',
      from: e.from_object,
      to: e.to_object,
      relation: e.relation_type,
      field: e.field_name,
      confidence: e.confidence,
    }));

    // Find semantic relationships
    const rels = await pool.query(
      `SELECT from_concept, to_concept, relation_type, confidence
       FROM semantic_relationships
       WHERE from_object = $1 OR to_object = $1
       ORDER BY confidence DESC
       LIMIT 10`,
      [objectName]
    );

    const businessConcepts = [
      node.concept,
      ...rels.rows.map(r => r.from_concept === node.concept ? r.to_concept : r.from_concept),
    ].filter((v, i, a) => a.indexOf(v) === i);

    return {
      object: objectName,
      nodeType: node.node_type,
      concept: node.concept,
      confidence: node.confidence,
      fields: relations.map(r => r.field).filter(Boolean),
      relations,
      businessConcepts,
      explanation: this._buildObjectExplanation(objectName, node, relations),
      trace,
    };
  }

  /**
   * Explain a path between two concepts/objects in the graph.
   *
   * @param {string} from - Starting concept or object name
   * @param {string} to - Target concept or object name
   * @returns {Promise<object>}
   */
  async explainPath(from, to) {
    const trace = { stage: 'GraphInspector', method: 'explainPath', input: { from, to }, steps: [] };

    const fromLower = from.toLowerCase().trim();
    const toLower = to.toLowerCase().trim();

    // Find starting node
    const fromNodes = await pool.query(
      `SELECT id, concept, object_name FROM semantic_graph_nodes
       WHERE concept = $1 OR object_name = $1 OR concept LIKE '%' || $1 || '%'
       ORDER BY confidence DESC LIMIT 3`,
      [fromLower]
    );
    trace.steps.push({ step: 'from_node', count: fromNodes.rows.length });

    // Find target node
    const toNodes = await pool.query(
      `SELECT id, concept, object_name FROM semantic_graph_nodes
       WHERE concept = $1 OR object_name = $1 OR concept LIKE '%' || $1 || '%'
       ORDER BY confidence DESC LIMIT 3`,
      [toLower]
    );
    trace.steps.push({ step: 'to_node', count: toNodes.rows.length });

    if (fromNodes.rows.length === 0 || toNodes.rows.length === 0) {
      return { path: [], confidence: 0, explanation: 'Path not found in graph', trace };
    }

    // BFS to find shortest path (max depth 5)
    const path = await this._findShortestPath(fromNodes.rows[0].id, toNodes.rows[0].id, 5);
    trace.steps.push({ step: 'bfs', depth: path.length });

    const confidence = path.length > 0
      ? Math.min(...path.map(p => p.confidence || 0.8))
      : 0;

    const pathFormatted = path.map(p => ({
      object: p.object_name,
      concept: p.concept,
      relation: p.relation_type,
      field: p.field_name,
    }));

    return {
      path: pathFormatted,
      confidence,
      explanation: this._buildPathExplanation(pathFormatted),
      trace,
    };
  }

  /**
   * Find a complete business route for a query.
   *
   * @param {string} term - Business term (e.g., "продажи по брендам")
   * @param {string} operation - Semantic operation (e.g., "aggregate")
   * @returns {Promise<object>}
   */
  async findBusinessRoute(term, operation) {
    const trace = { stage: 'GraphInspector', method: 'findBusinessRoute', input: { term, operation }, steps: [] };

    // Parse the term to extract entity and related
    const parts = term.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    const entity = parts[0] || term;
    const related = parts.slice(2); // skip "по" and similar prepositions

    // Find root object
    const rootNodes = await pool.query(
      `SELECT id, concept, object_name, confidence
       FROM semantic_graph_nodes
       WHERE concept = $1 OR concept LIKE '%' || $1 || '%'
       ORDER BY confidence DESC LIMIT 3`,
      [entity]
    );
    trace.steps.push({ step: 'root', count: rootNodes.rows.length });

    const root = rootNodes.rows.length > 0 ? rootNodes.rows[0].object_name : null;

    // Find related concept nodes
    const dimensions = [];
    const resources = [];
    for (const r of related) {
      const relNodes = await pool.query(
        `SELECT concept, object_name, confidence
         FROM semantic_graph_nodes
         WHERE concept = $1 OR concept LIKE '%' || $1 || '%'
         ORDER BY confidence DESC LIMIT 3`,
        [r]
      );
      if (relNodes.rows.length > 0) {
        dimensions.push(relNodes.rows[0].concept);
      }
    }
    trace.steps.push({ step: 'dimensions', count: dimensions.length });

    // Infer resources from operation
    if (operation === 'aggregate' || operation === 'sum') {
      resources.push('Сумма');
    } else if (operation === 'balance') {
      resources.push('Количество');
    } else if (operation === 'count') {
      resources.push('Количество');
    }

    return {
      root,
      dimensions,
      resources,
      operation: operation || 'list',
      trace,
    };
  }

  // ── BFS path finding ───────────────────────────────────────────

  async _findShortestPath(fromId, toId, maxDepth) {
    const visited = new Set([fromId]);
    let queue = [{ nodeId: fromId, path: [] }];

    for (let depth = 0; depth < maxDepth && queue.length > 0; depth++) {
      const nextQueue = [];
      for (const { nodeId, path } of queue) {
        // Get neighbors
        const neighbors = await pool.query(
          `SELECT e.relation_type, e.field_name, e.confidence,
                  tn.id AS next_id, tn.concept AS to_concept, tn.object_name AS to_object,
                  fn.concept AS from_concept, fn.object_name AS from_object
           FROM semantic_graph_edges e
           JOIN semantic_graph_nodes fn ON fn.id = e.from_node
           JOIN semantic_graph_nodes tn ON tn.id = e.to_node
           WHERE (e.from_node = $1 OR e.to_node = $1) AND e.approved = TRUE`,
          [nodeId]
        );

        for (const n of neighbors.rows) {
          const nextId = n.next_id === nodeId ? n.from_node || fromId : n.next_id;
          if (visited.has(nextId)) continue;
          visited.add(nextId);

          const step = {
            object_name: n.next_id === nodeId ? n.from_object : n.to_object,
            concept: n.next_id === nodeId ? n.from_concept : n.to_concept,
            relation_type: n.relation_type,
            field_name: n.field_name,
            confidence: n.confidence,
          };

          const newPath = [...path, step];

          if (nextId === toId) {
            return newPath;
          }

          nextQueue.push({ nodeId: nextId, path: newPath });
        }
      }
      queue = nextQueue;
    }

    return [];
  }

  // ── Explanation builders ───────────────────────────────────────

  _buildConceptExplanation(term, nodes, paths) {
    if (nodes.length === 0) {
      return `Термин "${term}" не найден в графе знаний.`;
    }

    const parts = [`Термин "${term}" связан с ${nodes.length} объектом(ами):`];
    for (const n of nodes) {
      parts.push(`  - ${n.object_name} (${n.node_type}, confidence: ${n.confidence})`);
    }

    if (paths.length > 0) {
      parts.push(`Найдено ${paths.length} маршрут(ов) в графе.`);
    }

    return parts.join('\n');
  }

  _buildObjectExplanation(objectName, node, relations) {
    const parts = [`Объект "${objectName}" (${node.node_type}) — бизнес-концепция: "${node.concept}".`];

    const outgoing = relations.filter(r => r.direction === 'outgoing');
    const incoming = relations.filter(r => r.direction === 'incoming');

    if (outgoing.length > 0) {
      parts.push(`Ссылается на ${outgoing.length} объект(ов):`);
      for (const r of outgoing.slice(0, 5)) {
        parts.push(`  → ${r.to} (${r.relation}, confidence: ${r.confidence})`);
      }
    }

    if (incoming.length > 0) {
      parts.push(`На ${objectName} ссылаются ${incoming.length} объект(ов).`);
    }

    return parts.join('\n');
  }

  _buildPathExplanation(path) {
    if (path.length === 0) return 'Путь не найден.';

    const parts = ['Маршрут:'];
    for (let i = 0; i < path.length; i++) {
      const step = path[i];
      if (i === 0) {
        parts.push(`  ${step.object} (${step.concept})`);
      } else {
        const prev = path[i - 1];
        const via = step.relation || step.field || '→';
        parts.push(`  ↓ [${via}]`);
        parts.push(`  ${step.object} (${step.concept})`);
      }
    }

    return parts.join('\n');
  }
}

module.exports = OneCGraphInspector;
