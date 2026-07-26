# ADR-045: Workflow Engine Architecture

**Status:** Accepted

**Date:** 2026-07-25

## Context

Sprint 6 completed the execution layer (AgentRuntime, ToolRegistry, MCPOrchestrator, ExecutionPipeline) and the security layer (PolicyProvider, ApprovalService). The platform now supports single-step execution with permission and approval gates.

Sprint 7 introduces a multi-step, multi-node execution model — a Workflow Engine that orchestrates agents, tools, MCP calls, approval gates, and conditional branches into a Directed Acyclic Graph (DAG).

## Decision

### Architecture Principle

The Workflow Engine does NOT execute actions directly. It:

1. Creates a Workflow DAG (definition + graph)
2. Manages state (WorkflowContext)
3. Delegates execution to existing services:
   - **AGENT node** → AgentRuntime
   - **TOOL node** → ToolRegistry
   - **MCP node** → MCPOrchestrator
   - **APPROVAL node** → ApprovalService

### 1. WorkflowContext

```js
WorkflowContext {
  id: string,           // UUID
  traceId: string,      // UUID
  status: string,       // CREATED | RUNNING | WAITING | PAUSED | COMPLETED | FAILED | CANCELLED
  input: any,           // workflow input payload
  nodes: object,        // node result map { nodeId: result }
  variables: object,    // shared mutable state
  metadata: object,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

Methods:
- `clone()` — deep copy with new traceId
- `fork(overrides)` — creates child context with inherited variables
- `setVariable(key, value)` / `getVariable(key)`

### 2. ExecutionGraph (Workflow Runtime)

Separate from `services/execution/ExecutionGraph` (tracing layer). The workflow runtime graph focuses on DAG scheduling:

```js
ExecutionNode { id, type, handler, dependencies[], retryPolicy, timeout, metadata }
ExecutionEdge { from, to, condition, metadata }
```

Node types: `AGENT`, `TOOL`, `MCP`, `CONDITION`, `APPROVAL`.

Methods:
- `addNode()`, `addEdge()`, `getNode()` — graph construction
- `validate()` — cycle detection, missing dependency checks
- `topologicalSort()` — Kahn's algorithm
- `getReadyNodes(completedIds)` — frontier computation

### 3. WorkflowDefinition

```js
WorkflowDefinition { id, name, version, graph: ExecutionGraph, metadata }
```

Methods: `validate()`, `toJSON()`.

### 4. DAG Executor (WorkflowExecutor)

Pipeline:
```
WorkflowContext created
  → Definition validated
  → Graph topologically sorted
  → Frontier loop:
      getReadyNodes()
      → parallel execute independent nodes
      → sequential within dependency chains
  → On failure: CompensationManager.compensateAll()
```

### 5. AgentRuntime Boundary

AGENT nodes call `AgentRuntime.execute(context, handlerOrType)` with a new `AgentContext` derived from `WorkflowContext.input` and `traceId`.

### 6. MCP Boundary

MCP nodes call `MCPOrchestrator.execute(action, context)` — reusing the full MCP pipeline (tool resolution → permission check → approval → execution → result).

### 7. Retry Model

```js
RetryPolicy { maxAttempts, strategy: fixed | exponential, baseDelay, maxDelay, retryableErrors[] }
```

- Fixed delay: constant `baseDelay`
- Exponential backoff: `baseDelay * 2^attempt` (capped at `maxDelay`)
- `shouldRetry(attempt, error)` — checks error code against `retryableErrors`

### 8. Compensation Model

```js
CompensationManager {
  registerCompensation(nodeId, handler)
  executeCompensation(nodeId, context)
  compensateAll(context)
  hasCompensation(nodeId)
}
```

Saga pattern foundation: on workflow failure, `compensateAll()` executes registered compensation handlers in sequence.

### 9. Parallel Execution

`getReadyNodes()` returns all nodes whose dependencies are satisfied. The executor uses `Promise.all()` to run ready nodes concurrently. Sequential execution is enforced via dependency edges.

### 10. Diagnostics Integration

New pipeline steps:
- `workflow_created`
- `workflow_validation`
- `workflow_execution`
- `workflow_node_start`
- `workflow_node_complete`
- `workflow_failed`

Metrics:
- `workflowDuration`
- `nodesExecuted`
- `nodesFailed`
- `retryCount`

## Consequences

- **Positive:** Multi-step workflows become composable from existing primitives (AgentRuntime, ToolRegistry, MCPOrchestrator).
- **Positive:** DAG model enables automatic parallelism for independent nodes.
- **Positive:** Compensation pattern provides saga-based rollback foundation.
- **Positive:** Retry policy is per-node configurable, with global defaults.
- **Positive:** Security layer (approval) is natively integrated as a node type.
- **Negative:** No persistent workflow storage — state is lost on process restart.
- **Negative:** No distributed execution — all nodes run in-process.
- **Negative:** No message queue — execution is synchronous within the executor.
- **Deferred:** UI workflow designer, persistent storage, distributed execution, cron scheduling.

## Related

- ADR-032: Agent Runtime Architecture
- ADR-031: MCP Orchestrator Foundation
- ADR-042: Execution Graph Foundation
- ADR-043: Permission Policy Engine
- ADR-044: Human Approval Workflow