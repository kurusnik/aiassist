# ADR-039: Execution Trace Graph

**Status:** Accepted

**Date:** 2026-07-25

**Supersedes:** ADR-024 (Pipeline Topology)

## Context

Current diagnostics use a linear `PipelineTrace` model:

```
Query → Planning → Safety → Agent → Execution → Result
```

Each trace is a flat array of `PipelineStep[]`. This works for single-agent, single-pipeline scenarios.

Sprint 6 introduces:
- **Workflow Engine** — multi-agent DAG with parallel branches
- **MCP Orchestrator** — nested tool calls within agent execution
- **Agent A → Tool Call → Agent B** — hierarchical execution

The linear model cannot represent:

- Parallel branches (Agent A and Agent B running concurrently)
- Parent-child relationships (Workflow → Agent → Tool)
- Nested diagnostics (MCP call inside an agent step)

## Decision

### 1. ExecutionGraph Model

Replace `PipelineTrace.steps: PipelineStep[]` with a graph structure:

```js
ExecutionGraph {
  id: string,              // traceId / executionId
  type: string,            // "workflow" | "agent" | "tool"
  startedAt: timestamp,
  finishedAt: timestamp,
  duration: number,
  status: "running" | "completed" | "failed" | "skipped",
  metadata: {},
  steps: [                 // ordered, but may have parallel paths
    ExecutionNode,
    ...
  ],
  links: [                 // explicit dependency edges
    { from: "step_a", to: "step_b", type: "depends_on" },
    { from: "step_a", to: "step_c", type: "fork" },
    { from: "step_c", to: "step_d", type: "join" }
  ]
}

ExecutionNode {
  id: string,              // stepId within this graph
  type: string,            // "planning_validation" | "safety_check" | "agent" | "tool" | "mcp" | "workflow"
  startedAt: timestamp,
  finishedAt: timestamp,
  duration: number,
  status: "pending" | "running" | "success" | "error" | "skipped",
  metadata: {},
  subgraph: ExecutionGraph | null  // for nested executions
}
```

### 2. Backward Compatibility

`ExecutionGraph` extends `PipelineTrace`:

- `PipelineTrace.steps` maps to flat `ExecutionGraph.getFlattenedSteps()`
- `PipelineTrace.getComputedMetrics()` works unchanged
- `PipelineTrace.toLegacyFormat()` works unchanged
- `PipelineTrace.toJSON()` serializes the graph

```js
class PipelineTrace {
  constructor(traceContext) {
    // existing fields...
    this.graph = new ExecutionGraph(this.id, "pipeline");
  }

  addStep(type) {
    return this.graph.addNode(type);
  }

  startStep(type) {
    return this.graph.startNode(type);
  }

  finishStep(type, metadata) {
    return this.graph.finishNode(type, metadata);
  }

  get steps() {
    return this.graph.nodes;
  }

  // new
  link(fromType, toType, linkType) {
    this.graph.addLink(fromType, toType, linkType);
  }

  nest(stepType, childGraph) {
    const node = this.graph.getNode(stepType);
    if (node) node.subgraph = childGraph;
  }
}
```

### 3. Hierarchical Traces

Workflow with nested agent and tool:

```
WorkflowExecution (root graph)
  │
  ├── step: "design" (agent)
  │     └── subgraph: AgentExecution
  │           ├── planning_validation
  │           ├── safety_check
  │           ├── execution
  │           │     └── subgraph: ToolExecution (MCP call)
  │           │           ├── mcp_connect
  │           │           ├── mcp_call
  │           │           └── mcp_response
  │           └── result_validation
  │
  ├── step: "review" (agent) ───── depends_on: "design"
  │     └── subgraph: AgentExecution
  │           ├── ...
  │
  └── step: "deploy" (tool) ────── depends_on: "review"
        └── subgraph: ToolExecution
              ├── ...
```

### 4. DiagnosticsStorage

```js
saveGraph(executionGraph) {
  // Flatten + persist with parent references
  const rows = flattenWithParent(graph, null);
  // INSERT INTO diagnostics_traces (id, parent_id, type, ...)
}

loadGraph(traceId) {
  // SELECT * FROM diagnostics_traces WHERE id = $1 OR parent_chain @> $1
  // Reconstruct graph from flat rows with parent references
}
```

No schema migration yet — `parent_id` and `type` columns are deferred to Sprint 7. The graph model exists in memory only.

### 5. Metrics Adaptation

`getComputedMetrics()` is extended:

```js
getComputedMetrics() {
  const flatSteps = this.graph.getFlattenedSteps();

  // Walk subgraphs recursively
  const workflowDuration = this.graph.walk(node => {
    // collect per-type durations across all nesting levels
  });

  return {
    totalDuration: this.duration,
    workflowDuration,
    agentDuration: this._sumDuration("agent"),
    toolDuration: this._sumDuration("tool"),
    mcpDuration: this._sumDuration("mcp"),
    maxParallelism: this.graph.getMaxParallelism()
  };
}
```

## Consequences

- **Positive:** Single model for linear, parallel, and hierarchical execution traces.
- **Positive:** Backward compatible — all existing `PipelineTrace` consumers work unchanged.
- **Positive:** Workflow Engine and MCP Orchestrator write diagnostics into the same graph structure.
- **Negative:** Graph traversal adds computational overhead — acceptable for diagnostics (not hot path).
- **Deferred:** UI visualization of execution graphs, graph-based analytics dashboard.