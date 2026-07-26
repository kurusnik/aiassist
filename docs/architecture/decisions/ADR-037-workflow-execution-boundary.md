# ADR-037: Workflow Execution Boundary

**Status:** Accepted

**Date:** 2026-07-25

## Context

Sprint 5 created `AgentRuntime` — a lifecycle manager for a single agent execution. Sprint 6 requires a `Workflow Engine` that orchestrates multiple agents, tools, and parallel execution paths.

Before this ADR, the boundary between `AgentRuntime` and `Workflow Engine` was undefined:

- `ExecutionPipeline` wraps a single agent — should the Workflow Engine use it or replace it?
- `AgentRuntime.execute()` has a single lifecycle — what happens when an agent fails mid-workflow?
- No concept of DAG, retries, compensation, or parallel branches

## Decision

### 1. Core Distinction

```
AgentRuntime                   Workflow Engine
────────────────────────────   ────────────────────────────
One agent                      N agents + tools
One lifecycle                  DAG of lifecycles
One AgentResult in             AgentResult[] out
Synchronous execution          Parallel branches + joins
No retry logic                 Configurable retries
No compensation                Compensation actions on failure
No branching                   Branching + merging
```

### 2. AgentRuntime Responsibility

`AgentRuntime` owns exactly:

- Single `AgentLifecycle` state machine
- Single `AgentContext` → `AgentResult` transformation
- Handler dispatch (function or registry)
- Planning validation, safety check, execution, result validation
- Runtime metadata: `executionId`, `duration`, `lifecycle`, `agentType`

It does NOT own:

- DAG orchestration
- Parallel execution
- Retries or timeouts
- Compensation
- Cross-agent state

### 3. Workflow Engine Responsibility

The `Workflow Engine` (`services/workflow/`, Sprint 6 Phase C):

```
WorkflowDefinition:
  steps:
    - id: "design"
      type: agent
      agentType: "programming"
      input: { context: "$.ctx" }
    - id: "review"
      type: agent
      agentType: "reviewer"
      input: { result: "$.steps.design.output" }
      dependsOn: ["design"]
    - id: "deploy"
      type: tool
      toolId: "mcp:deploy"
      input: { code: "$.steps.review.output" }
      dependsOn: ["review"]
      onFailure: "rollback"

WorkflowExecution:
  - Executes each step via AgentRuntime or ToolRegistry
  - Manages DAG resolution: topological sort, parallel branches
  - Handles retries: { maxRetries: 3, backoff: "exponential" }
  - Handles compensation: { onFailure: "rollback" }
  - Produces WorkflowResult: { stepResults, status, errors, timeline }
```

### 4. Integration Contract

```
Workflow Engine
  │
  ├── AgentRuntime.execute(context, handler)   ← for agent steps
  │     └── AgentResult
  │
  └── ToolRegistry.execute(toolId, params)     ← for tool steps (Sprint 6 Phase A)
        └── ToolResult
```

The Workflow Engine does NOT:

- Import `ExecutionPipeline` directly (it delegates to AgentRuntime per step)
- Replace `AgentRuntime` lifecycle (each step has its own lifecycle)
- Duplicate safety checks (delegated to each step's AgentRuntime/ToolRegistry)

### 5. Context Propagation

The Workflow Engine uses `AgentContext.fork()` from ADR-034:

```
WorkflowContext:
  workflowId: uuid
  parentTraceId: uuid
  branches: Map<stepId, AgentContext>
  sharedState: { ... }  // immutable result references

Each step:
  stepContext = parentContext.fork({
    planningContext: step.planning,
    metadata: { stepId, workflowId, ... }
  })
```

`WorkflowContext` is NOT a subclass of `AgentContext`. They serve different purposes:

- `AgentContext` — input envelope for one agent execution
- `WorkflowContext` — orchestration state for the entire workflow

### 6. No Workflow Engine in Sprint 5.x

The Workflow Engine is Sprint 6 Phase C. This ADR only defines the boundary.

## Consequences

- **Positive:** AgentRuntime stays single-responsibility; Workflow Engine handles orchestration.
- **Positive:** Workflow steps can be agents (via AgentRuntime) or tools (via ToolRegistry) interchangeably.
- **Positive:** `fork()` contract exists and is ready for multi-branch context propagation.
- **Negative:** Workflow Engine must manage its own DAG and compensation — cannot reuse ExecutionPipeline's linear flow.
- **Deferred:** Workflow persistence, pause/resume, long-running workflows.