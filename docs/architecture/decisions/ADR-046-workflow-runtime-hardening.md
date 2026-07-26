# ADR-046: Workflow Runtime Hardening

**Status:** Accepted

**Date:** 2026-07-25

## Context

Sprint 7 introduced the Workflow Engine foundation: DAG execution, topological sorting, retry policy, compensation, and multi-type nodes (AGENT, TOOL, MCP, CONDITION, APPROVAL).

Production scenarios require:
- Event-driven observability
- State persistence for recovery
- Graceful recovery from failures
- Proper approval node lifecycle (WAITING state)
- Decoupled handler resolution

## Decision

### 1. Event Model

```js
WorkflowEvent {
  id: string,
  workflowId: string | null,
  nodeId: string | null,
  type: string,
  timestamp: number,
  payload: object
}
```

Event types:
- `WORKFLOW_STARTED`, `WORKFLOW_COMPLETED`, `WORKFLOW_FAILED`
- `NODE_STARTED`, `NODE_COMPLETED`, `NODE_FAILED`
- `RETRY_STARTED`
- `COMPENSATION_STARTED`

`WorkflowEventBus` is an in-memory pub/sub bus:
- `emit(type, data)` — synchronous dispatch to all subscribers of that type + wildcard `*`
- `subscribe(type, handler)` — returns unsubscribe function
- `unsubscribe(type, handler)` — removes specific handler
- Subscriber errors are caught and suppressed — the bus never throws.

### 2. Persistence Boundary

```js
WorkflowStorage (abstract interface):
  saveWorkflow(context)
  loadWorkflow(workflowId)
  updateNodeState(workflowId, nodeId, state)
  listRunning()
  removeWorkflow(workflowId)

InMemoryWorkflowStorage (concrete implementation)
```

The interface is designed for future PostgreSQL/Redis backends. `InMemoryWorkflowStorage` stores contexts and per-node states in Maps.

### 3. Execution Recovery

`WorkflowExecutor.resume(workflowId)`:

1. Load workflow context from storage
2. Skip already-completed nodes (checked via `getNodeState`)
3. Set status to RUNNING
4. Execute remaining nodes from the frontier
5. On completion: set COMPLETED or FAILED

Recovery is idempotent — completed nodes are never re-executed.

### 4. Approval Node Lifecycle

APPROVAL node follows:

```
node start
  → create ApprovalRequest (via ApprovalService)
  → WAITING state (context.status)
  → poll ApprovalService.checkStatus() every 500ms
  → approved → continue DAG
  → rejected/expired → NODE_FAILED
```

The polling timeout is 30 seconds. No persistent wait mechanism.

### 5. WorkflowNodeRegistry

Decouples WorkflowExecutor from direct service references:

```js
WorkflowNodeRegistry {
  register(type, handler)
  get(type)
  has(type)
  remove(type)
  list()
  count()
  clear()
}
```

Handlers are registered lazily via `_registerDefaults()`. The executor no longer hard-depends on AgentRuntime, MCPOrchestrator, or ToolRegistry at the constructor level.

Default handlers internally resolve services:
- `agent` → `AgentRuntime`
- `tool` → `ToolRegistry`
- `mcp` → `MCPOrchestrator`
- `approval` → `ApprovalService`
- `condition` → inline handler

### 6. Diagnostics Additions

Pipeline steps are unchanged. Added metadata fields:
- `workflowId`, `nodeId`, `eventType`, `recoveryAttempt`

New metrics:
- `resumeDuration` — time spent in resume()
- `waitingDuration` — time spent in approval polling
- `nodeExecutionCount` — total node executions (including retries)

### 7. Backward Compatibility

All existing tests pass without changes. Default handlers are registered only if no custom handler is already registered for that type. The constructor still accepts `agentRuntime`, `toolRegistry`, `mcpOrchestrator`, `approvalService` as before.

## Consequences

- **Positive:** Events enable external observers (logging, metrics, UI) without coupling.
- **Positive:** Recovery is idempotent and works for any FAILED/RUNNING workflow.
- **Positive:** NodeRegistry makes the executor extensible — custom node types can be added at runtime.
- **Positive:** Approval polling allows synchronous workflow execution with async human approval.
- **Negative:** No persistent storage — recovery is lost on process restart.
- **Negative:** Approval polling is synchronous within the executor thread.
- **Deferred:** PostgreSQL storage backend, webhook-based approval notification, distributed workers.

## Related

- ADR-045: Workflow Engine Architecture
- ADR-044: Human Approval Workflow
- ADR-032: Agent Runtime Architecture