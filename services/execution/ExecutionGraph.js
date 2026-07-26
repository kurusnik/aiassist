const ExecutionNode = require('./ExecutionNode');
const ExecutionEdge = require('./ExecutionEdge');

class ExecutionGraph {
  constructor(id, type = 'pipeline', options = {}) {
    this.id = id;
    this.type = type;
    this.startedAt = options.startedAt || null;
    this.finishedAt = options.finishedAt || null;
    this.duration = options.duration || null;
    this.status = options.status || 'running';
    this.metadata = options.metadata || {};
    this._nodes = new Map();
    this._edges = [];
  }

  addNode(type, id = null, options = {}) {
    const nodeId = id || `${this.id}:${type}:${this._nodes.size + 1}`;
    if (this._nodes.has(nodeId)) {
      return this._nodes.get(nodeId);
    }
    const node = new ExecutionNode(nodeId, type, options);
    this._nodes.set(nodeId, node);
    return node;
  }

  getNode(id) {
    return this._nodes.get(id) || null;
  }

  hasNode(id) {
    return this._nodes.has(id);
  }

  addEdge(from, to, type = ExecutionEdge.LINK_TYPES.DEPENDS_ON, metadata = {}) {
    const edge = new ExecutionEdge(from, to, type, metadata);
    this._edges.push(edge);
    return edge;
  }

  get nodes() {
    return Array.from(this._nodes.values());
  }

  get edges() {
    return this._edges.slice();
  }

  flatten() {
    const flatSteps = [];
    for (const node of this._nodes.values()) {
      flatSteps.push(node);
      if (node.subgraph) {
        flatSteps.push(...node.subgraph.flatten());
      }
    }
    return flatSteps;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      startedAt: this.startedAt ? new Date(this.startedAt).toISOString() : null,
      finishedAt: this.finishedAt ? new Date(this.finishedAt).toISOString() : null,
      duration: this.duration,
      status: this.status,
      metadata: this.metadata,
      nodes: this.nodes.map(n => n.toJSON()),
      edges: this._edges.map(e => e.toJSON())
    };
  }
}

module.exports = ExecutionGraph;