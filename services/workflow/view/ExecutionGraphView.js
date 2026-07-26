const { ExecutionGraph, ExecutionNode } = require('../ExecutionGraph');

const NODE_STATUS_MAP = {
  pending: 'CREATED',
  running: 'RUNNING',
  completed: 'COMPLETED',
  failed: 'FAILED',
  skipped: 'SKIPPED',
  waiting: 'WAITING',
  compensated: 'COMPENSATED'
};

class ExecutionGraphView {
  constructor(options = {}) {
    this.eventStore = options.eventStore || null;
    this.storage = options.storage || null;
  }

  async buildView(workflowId, graph) {
    if (!graph && this.storage) {
      const context = await this.storage.loadWorkflow(workflowId);
      if (context && context.metadata && context.metadata.workflowDefinition) {
        graph = context.metadata.workflowDefinition.graph;
      }
    }

    if (!graph || !(graph instanceof ExecutionGraph)) {
      return {
        success: false,
        error: 'ExecutionGraph not available',
        nodes: [],
        edges: []
      };
    }

    const statusMap = await this._buildNodeStatusMap(workflowId, graph);
    const durationMap = await this._buildNodeDurationMap(workflowId, graph);

    const nodes = graph.nodes.map(node => {
      const statusInfo = statusMap.get(node.id) || { status: 'pending', startedAt: null, finishedAt: null };
      const duration = durationMap.get(node.id) || 0;

      return {
        id: node.id,
        type: node.type,
        status: NODE_STATUS_MAP[statusInfo.status] || 'CREATED',
        duration,
        startedAt: statusInfo.startedAt ? new Date(statusInfo.startedAt).toISOString() : null,
        finishedAt: statusInfo.finishedAt ? new Date(statusInfo.finishedAt).toISOString() : null,
        label: node.metadata && node.metadata.label ? node.metadata.label : node.id,
        retryPolicy: node.retryPolicy ? {
          maxAttempts: node.retryPolicy.maxAttempts,
          strategy: node.retryPolicy.strategy || 'fixed'
        } : null,
        timeout: node.timeout || null
      };
    });

    const edges = graph.edges.map(edge => ({
      from: edge.from,
      to: edge.to,
      condition: edge.condition ? (typeof edge.condition === 'object' ? edge.condition.value || null : null) : null,
      label: edge.metadata && edge.metadata.label ? edge.metadata.label : null
    }));

    return {
      success: true,
      workflowId,
      nodes,
      edges,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      graphId: graph.id
    };
  }

  async _buildNodeStatusMap(workflowId, graph) {
    const statusMap = new Map();
    if (!this.storage) {
      for (const node of graph.nodes) {
        statusMap.set(node.id, { status: 'pending', startedAt: null, finishedAt: null });
      }
      return statusMap;
    }

    for (const node of graph.nodes) {
      try {
        const state = await this.storage.getNodeState(workflowId, node.id);
        if (state) {
          const statusInfo = {
            status: state.status || 'pending',
            startedAt: state.startedAt || null,
            finishedAt: state.finishedAt || null
          };
          if (state.metadata && state.metadata.startedAt) statusInfo.startedAt = state.metadata.startedAt;
          if (state.metadata && state.metadata.finishedAt) statusInfo.finishedAt = state.metadata.finishedAt;
          statusMap.set(node.id, statusInfo);
        } else {
          statusMap.set(node.id, { status: 'pending', startedAt: null, finishedAt: null });
        }
      } catch (_) {
        statusMap.set(node.id, { status: 'pending', startedAt: null, finishedAt: null });
      }
    }

    return statusMap;
  }

  async _buildNodeDurationMap(workflowId, graph) {
    const durationMap = new Map();
    if (!this.eventStore) return durationMap;

    try {
      const events = await this.eventStore.getHistory(workflowId);
      for (const event of events) {
        if (event.nodeId && (event.type === 'node_completed' || event.type === 'node_failed')) {
          if (!durationMap.has(event.nodeId)) {
            durationMap.set(event.nodeId, 0);
          }
          const nodeEvents = events.filter(e => e.nodeId === event.nodeId);
          const startEvent = nodeEvents.find(e => e.type === 'node_started');
          const endEvent = nodeEvents.find(e => e.type === 'node_completed' || e.type === 'node_failed');
          if (startEvent && endEvent) {
            durationMap.set(event.nodeId, new Date(endEvent.timestamp).getTime() - new Date(startEvent.timestamp).getTime());
          }
        }
      }
    } catch (_) {
    }

    return durationMap;
  }

  static getAvailableStatuses() {
    return Object.values(NODE_STATUS_MAP);
  }
}

ExecutionGraphView.STATUS_MAP = NODE_STATUS_MAP;

module.exports = ExecutionGraphView;