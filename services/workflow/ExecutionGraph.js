const NODE_TYPES = {
  AGENT: 'agent',
  TOOL: 'tool',
  MCP: 'mcp',
  CONDITION: 'condition',
  APPROVAL: 'approval'
};

class ExecutionNode {
  constructor(id, type, options = {}) {
    this.id = id;
    this.type = type;
    this.handler = options.handler || null;
    this.dependencies = options.dependencies || [];
    this.retryPolicy = options.retryPolicy || null;
    this.timeout = options.timeout || null;
    this.metadata = options.metadata || {};
  }
}

ExecutionNode.NODE_TYPES = NODE_TYPES;

class ExecutionEdge {
  constructor(from, to, options = {}) {
    this.from = from;
    this.to = to;
    this.condition = options.condition || null;
    this.metadata = options.metadata || {};
  }
}

class ExecutionGraph {
  constructor(options = {}) {
    this.id = options.id || 'graph';
    this._nodes = new Map();
    this._edges = [];
  }

  addNode(id, type, options = {}) {
    if (this._nodes.has(id)) {
      throw new Error(`Node "${id}" already exists`);
    }
    const node = new ExecutionNode(id, type, options);
    this._nodes.set(id, node);
    return node;
  }

  addEdge(from, to, options = {}) {
    if (!this._nodes.has(from)) {
      throw new Error(`Source node "${from}" not found`);
    }
    if (!this._nodes.has(to)) {
      throw new Error(`Target node "${to}" not found`);
    }
    const edge = new ExecutionEdge(from, to, options);
    this._edges.push(edge);
    return edge;
  }

  getNode(id) {
    return this._nodes.get(id) || null;
  }

  hasNode(id) {
    return this._nodes.has(id);
  }

  removeNode(id) {
    this._nodes.delete(id);
    this._edges = this._edges.filter(e => e.from !== id && e.to !== id);
  }

  get nodes() {
    return Array.from(this._nodes.values());
  }

  get edges() {
    return this._edges.slice();
  }

  getNodeIds() {
    return Array.from(this._nodes.keys());
  }

  validate() {
    const errors = [];

    if (this._nodes.size === 0) {
      errors.push('Graph has no nodes');
    }

    const adjacency = new Map();
    for (const [id] of this._nodes) {
      adjacency.set(id, []);
    }
    for (const edge of this._edges) {
      if (adjacency.has(edge.from)) {
        adjacency.get(edge.from).push(edge.to);
      }
    }

    const visited = new Set();
    const recursionStack = new Set();
    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map();

    for (const id of this._nodes.keys()) {
      color.set(id, WHITE);
    }

    const dfs = (nodeId) => {
      color.set(nodeId, GRAY);
      for (const neighbor of (adjacency.get(nodeId) || [])) {
        if (color.get(neighbor) === GRAY) {
          errors.push(`Cycle detected: ${nodeId} → ${neighbor}`);
          return;
        }
        if (color.get(neighbor) === WHITE) {
          dfs(neighbor);
        }
      }
      color.set(nodeId, BLACK);
    };

    for (const id of this._nodes.keys()) {
      if (color.get(id) === WHITE) {
        dfs(id);
      }
    }

    for (const [id, node] of this._nodes) {
      for (const dep of node.dependencies) {
        if (!this._nodes.has(dep)) {
          errors.push(`Node "${id}" depends on missing node "${dep}"`);
        }
      }
    }

    const nodeIdSet = new Set(this._nodes.keys());
    for (const edge of this._edges) {
      if (!nodeIdSet.has(edge.from)) {
        errors.push(`Edge references missing source node "${edge.from}"`);
      }
      if (!nodeIdSet.has(edge.to)) {
        errors.push(`Edge references missing target node "${edge.to}"`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  topologicalSort() {
    const adjacency = new Map();
    const inDegree = new Map();

    for (const [id] of this._nodes) {
      adjacency.set(id, []);
      inDegree.set(id, 0);
    }

    for (const edge of this._edges) {
      adjacency.get(edge.from).push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }

    const queue = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    const result = [];
    while (queue.length > 0) {
      const nodeId = queue.shift();
      result.push(nodeId);
      for (const neighbor of (adjacency.get(nodeId) || [])) {
        inDegree.set(neighbor, inDegree.get(neighbor) - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      }
    }

    return result;
  }

  getReadyNodes(completedIds = [], context = null) {
    const completed = new Set(completedIds);
    const ready = [];

    for (const [id, node] of this._nodes) {
      if (completed.has(id)) continue;

      const depsSatisfied = node.dependencies.every(d => completed.has(d));

      const edgeDepsSatisfied = this._edges
        .filter(e => e.to === id)
        .every(e => {
          if (!completed.has(e.from)) return false;
          if (e.condition) {
            return this._evaluateCondition(e.condition, context);
          }
          return true;
        });

      if (depsSatisfied && edgeDepsSatisfied) {
        ready.push(node);
      }
    }

    return ready;
  }

  _evaluateCondition(condition, context) {
    if (typeof condition === 'function') {
      return condition(context);
    }
    if (typeof condition === 'object' && condition !== null) {
      const variableValue = context && context.getVariable
        ? context.getVariable(condition.variable)
        : undefined;
      return variableValue === condition.value;
    }
    return true;
  }

  toJSON() {
    return {
      id: this.id,
      nodes: this.nodes.map(n => ({
        id: n.id,
        type: n.type,
        dependencies: n.dependencies,
        retryPolicy: n.retryPolicy,
        timeout: n.timeout,
        metadata: n.metadata
      })),
      edges: this._edges.map(e => ({
        from: e.from,
        to: e.to,
        condition: e.condition,
        metadata: e.metadata
      }))
    };
  }
}

ExecutionGraph.NODE_TYPES = NODE_TYPES;

module.exports = { ExecutionGraph, ExecutionNode, ExecutionEdge };